/**
 * Novedades semanales: busca noticias sobre los temas de noticias.config.json,
 * las cruza con la wiki, las resume con Claude y guarda el estado en
 * data/noticias.json. Lo que el usuario decide agregar se escribe como nota en
 * el vault (y se registra en log.md e index.md).
 *
 * No hay tarea programada: cada vez que se abre el inicio o la página de
 * Novedades se revisa si pasaron los días configurados y, si pasaron, se busca
 * en segundo plano. Los resúmenes también se hacen en segundo plano, de a uno.
 */
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type MiniSearch from "minisearch";
import { createAskIndex, type AskChunk, type AskNote } from "@content/ask";
import {
  extractArticleText,
  feedUrl,
  indexWithNews,
  isExcluded,
  isRecent,
  logEntry,
  newsKey,
  noteFileName,
  noteMarkdown,
  parseRss,
  sameStory,
  splitQuery,
  SUMMARY_SYSTEM_PROMPT,
  summaryPrompt,
  type FeedItem,
  type NewsItem,
  type NewsTopic,
  type RelatedNote,
} from "@content/news";
import { vaultConfig } from "../../scripts/vault-config";
import { getAllNotes } from "./content.server";
import { CLAUDE_MODEL_NAME, claudeText, hasApiKey } from "./claude.server";

interface NewsConfig {
  carpetaEnElVault: string;
  diasEntreBusquedas: number;
  maxNoticias: number;
  temas: NewsTopic[];
}

interface NewsStore {
  /** Última búsqueda terminada (ISO). */
  lastRun: string | null;
  lastError: string | null;
  items: NewsItem[];
}

const root = process.cwd();
const STORE = join(root, "data", "noticias.json");
/** Por tema se guardan pocas noticias, para que un solo tema no tape a los demás. */
const PER_TOPIC = 4;
/** Carpetas cuyas notas no cuentan como "relacionadas" (son registros, no conocimiento). */
const NOT_RELATED = new Set(["noticias", ""]);
/** Algunos medios rechazan pedidos sin navegador conocido. */
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function config(): NewsConfig {
  return JSON.parse(readFileSync(join(root, "noticias.config.json"), "utf8"));
}

/* ----------------------------------------------------------------- estado */

/**
 * Estado compartido en globalThis: en desarrollo el módulo se recarga al editar
 * y quedarían dos copias, cada una con su búsqueda. Así hay una sola.
 */
const shared = ((
  globalThis as {
    __guimindNews?: { store: NewsStore | null; running: Promise<void> | null; summarizing: Promise<void> | null };
  }
).__guimindNews ??= { store: null, running: null, summarizing: null });

function load(): NewsStore {
  shared.store ??= existsSync(STORE)
    ? (JSON.parse(readFileSync(STORE, "utf8")) as NewsStore)
    : { lastRun: null, lastError: null, items: [] };
  // Noticias guardadas por versiones anteriores (sin copete ni resumen). Se revisa
  // siempre: en desarrollo el estado en memoria puede venir de una versión vieja del módulo.
  for (const i of shared.store.items) {
    i.snippet ??= "";
    i.summary ??= { state: "error", reason: "Noticia de una búsqueda anterior, sin link directo para leerla." };
  }
  return shared.store;
}

/** Un error en segundo plano se registra, pero nunca tira abajo el servidor. */
function logFailure(what: string) {
  return (error: unknown) => console.error(`[novedades] Falló ${what}:`, error);
}

async function save(): Promise<void> {
  await mkdir(dirname(STORE), { recursive: true });
  // Escritura atómica: si se corta a la mitad, el archivo anterior queda intacto.
  await writeFile(`${STORE}.tmp`, JSON.stringify(load(), null, 2));
  await rename(`${STORE}.tmp`, STORE);
}

export interface NewsState {
  lastRun: string | null;
  lastError: string | null;
  running: boolean;
  summarizing: boolean;
  nextRun: string | null;
  items: NewsItem[];
}

export function newsState(): NewsState {
  const s = load();
  const days = config().diasEntreBusquedas;
  return {
    lastRun: s.lastRun,
    lastError: s.lastError,
    running: shared.running !== null,
    summarizing: shared.summarizing !== null,
    nextRun: s.lastRun ? new Date(Date.parse(s.lastRun) + days * 86_400_000).toISOString() : null,
    items: s.items,
  };
}

export function pendingCount(): number {
  return load().items.filter((i) => i.status === "nueva").length;
}

/**
 * Si pasaron los días configurados desde la última búsqueda, busca en segundo
 * plano. Si quedaron resúmenes sin hacer (por ejemplo, se cerró GuiMind), los retoma.
 */
export function ensureFresh(): void {
  const { lastRun } = load();
  const due = !lastRun || Date.now() - Date.parse(lastRun) >= config().diasEntreBusquedas * 86_400_000;
  if (due) void refresh();
  else summarizePending();
}

/** Busca novedades ahora. Si ya hay una búsqueda en curso, espera esa. */
export function refresh(): Promise<void> {
  shared.running ??= search()
    .then(() => void summarizePending())
    .catch(logFailure("la búsqueda de novedades"))
    .finally(() => {
      shared.running = null;
    });
  return shared.running;
}

/* ---------------------------------------------------------------- búsqueda */

async function search(): Promise<void> {
  const cfg = config();
  const s = load();
  const found = new Date().toISOString();
  // Titulares ya vistos (esta búsqueda y las anteriores): la misma noticia de otro medio no se repite.
  const known: string[] = s.items.map((i) => i.title);
  const results: { topic: NewsTopic; items: FeedItem[] }[] = [];
  const failures: string[] = [];

  // De a 4 búsquedas en paralelo: rápido sin saturar la conexión.
  const queue = [...cfg.temas];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let topic = queue.shift(); topic; topic = queue.shift()) {
        try {
          const { query, exclude } = splitQuery(topic.busqueda);
          const res = await fetch(feedUrl(query), {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const items = parseRss(await res.text()).filter(
            (i) => isRecent(i, cfg.diasEntreBusquedas) && !isExcluded(i, exclude),
          );
          results.push({ topic, items });
        } catch (error) {
          failures.push(`"${topic.busqueda}" (${error instanceof Error ? error.message : String(error)})`);
        }
      }
    }),
  );

  if (results.length === 0) {
    s.lastError = `No se pudo buscar ninguna noticia. ¿Hay conexión a internet? Fallaron: ${failures.join(", ")}`;
    await save();
    return;
  }

  const relevance = relevanceFinder();
  const fresh: NewsItem[] = [];
  for (const { topic, items } of results) {
    let kept = 0;
    const scored = items
      .map((item) => ({ item, ...relevance(`${item.title} ${item.snippet}`) }))
      .filter((x) => x.related.length > 0)
      .sort((a, b) => b.score - a.score);
    for (const { item, related, score } of scored) {
      if (kept >= PER_TOPIC) break;
      if (known.some((k) => sameStory(k, item.title))) continue;
      known.push(item.title);
      kept++;
      const key = newsKey(item.title);
      fresh.push({
        ...item,
        id: `${found.slice(0, 10)}-${fresh.length}-${key.slice(0, 40).replace(/ /g, "-")}`,
        topic: topic.busqueda,
        sector: topic.sector,
        related,
        score,
        status: "nueva",
        summary: { state: "pendiente" },
        found,
      });
    }
  }

  fresh.sort((a, b) => b.score - a.score);
  s.items = [...fresh.slice(0, cfg.maxNoticias), ...s.items];
  s.lastRun = found;
  s.lastError = failures.length ? `Algunas búsquedas fallaron: ${failures.join(", ")}` : null;
  await save();
}

/** Cruza un texto con la wiki: qué notas se relacionan y cuánto. */
function relevanceFinder(): (text: string) => { related: RelatedNote[]; score: number } {
  const notes = getAllNotes().filter((n: AskNote) => !NOT_RELATED.has(n.folder));
  const { index } = createAskIndex(notes) as { index: MiniSearch<AskChunk> };
  const titles = new Map(notes.map((n) => [n.slug, n.title]));
  return (text) => {
    const bySlug = new Map<string, number>();
    for (const hit of index.search(text).slice(0, 30)) {
      const slug = String(hit.id).split("#")[0]!;
      bySlug.set(slug, Math.max(bySlug.get(slug) ?? 0, hit.score));
    }
    const ranked = [...bySlug].sort((a, b) => b[1] - a[1]).slice(0, 3);
    return {
      related: ranked.map(([slug]) => ({ slug, title: titles.get(slug) ?? slug })),
      score: Math.round(ranked.reduce((sum, [, sc]) => sum + sc, 0) * 10) / 10,
    };
  };
}

/* --------------------------------------------------------------- resúmenes */

/** Resume, de a una, las noticias nuevas que todavía no tienen resumen (las más relevantes primero). */
function summarizePending(): Promise<void> {
  shared.summarizing ??= (async () => {
    for (;;) {
      const next = load()
        .items.filter((i) => i.status === "nueva" && i.summary.state === "pendiente")
        .sort((a, b) => b.score - a.score)[0];
      if (!next) break;
      next.summary = await summarize(next);
      await save();
      // Sin clave (o con la clave rechazada) no tiene sentido seguir intentando con las demás ahora.
      if (next.summary.state === "error" && next.summary.reason.includes("ANTHROPIC_API_KEY")) {
        for (const i of load().items) if (i.summary.state === "pendiente") i.summary = next.summary;
        await save();
        break;
      }
    }
  })()
    .catch(logFailure("el resumen de novedades"))
    .finally(() => {
      shared.summarizing = null;
    });
  return shared.summarizing;
}

async function summarize(item: NewsItem): Promise<NewsItem["summary"]> {
  if (!hasApiKey()) {
    return { state: "error", reason: "Falta ANTHROPIC_API_KEY en el .env: agregala, reiniciá GuiMind y pedí el resumen de nuevo." };
  }
  let text: string;
  try {
    const res = await fetch(item.url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-AR,es;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { state: "error", reason: `El medio no dejó leer la nota (HTTP ${res.status}).` };
    if (!(res.headers.get("content-type") ?? "").includes("html")) {
      return { state: "error", reason: "El link no lleva a una página de texto." };
    }
    text = extractArticleText(await res.text());
  } catch {
    return { state: "error", reason: "No se pudo abrir la nota (el medio no respondió)." };
  }
  if (!text) return { state: "error", reason: "No se pudo leer el texto de la nota (puede tener muro de pago)." };

  try {
    const summary = await claudeText(SUMMARY_SYSTEM_PROMPT, summaryPrompt(item, text), AbortSignal.timeout(300_000));
    return { state: "listo", text: summary, model: CLAUDE_MODEL_NAME };
  } catch (error) {
    return { state: "error", reason: error instanceof Error ? error.message : "El modelo no pudo resumir la nota." };
  }
}

/* --------------------------------------------------------------- acciones */

function find(id: string): NewsItem {
  const item = load().items.find((i) => i.id === id);
  if (!item) throw new Error("No se encontró esa noticia. Recargá la página.");
  return item;
}

/** Vuelve a pedir el resumen de una noticia (por ejemplo, si faltaba la clave de la API). */
export async function retrySummary(id: string): Promise<void> {
  const item = find(id);
  item.summary = { state: "pendiente" };
  await save();
  void summarizePending();
}

/** Escribe la noticia como nota en el vault y deja constancia en log.md e index.md. */
export async function addToVault(id: string): Promise<string> {
  const item = find(id);
  if (item.status === "agregada" && item.notePath) return item.notePath;

  const { dir } = vaultConfig(root);
  const folder = join(dir, ...config().carpetaEnElVault.split("/"));
  await mkdir(folder, { recursive: true });

  // Si ya existe una nota con ese nombre, no se pisa: se numera.
  const base = noteFileName(item).replace(/\.md$/, "");
  let file = join(folder, `${base}.md`);
  let title = base;
  for (let n = 2; existsSync(file); n++) {
    title = `${base} (${n})`;
    file = join(folder, `${title}.md`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const notePath = relative(dir, file).split(sep).join("/");
  await writeFile(file, noteMarkdown(item, today), { flag: "wx" });

  const log = join(dir, "log.md");
  if (existsSync(log)) {
    const current = await readFile(log, "utf8");
    await appendFile(log, (current.endsWith("\n") ? "" : "\n") + logEntry(item, today, notePath));
  }
  const index = join(dir, "index.md");
  if (existsSync(index)) {
    await writeFile(index, indexWithNews(await readFile(index, "utf8"), title, item));
  }

  item.status = "agregada";
  item.notePath = notePath;
  await save();
  return notePath;
}

export async function setStatus(id: string, status: "nueva" | "descartada"): Promise<void> {
  const item = find(id);
  if (item.status === "agregada") throw new Error("Esa noticia ya está en el cerebro.");
  item.status = status;
  await save();
}
