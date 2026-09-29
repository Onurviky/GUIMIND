/**
 * Servidor del chat "Preguntale al cerebro". Dos motores posibles (LLM_PROVIDER en .env):
 *
 *   ollama     (por defecto) modelo local y gratuito vía Ollama. Nada sale de la computadora.
 *   anthropic  API de Claude. Necesita ANTHROPIC_API_KEY, que vive solo acá (nunca llega al navegador).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type MiniSearch from "minisearch";
import {
  ASK_LIMITS,
  ASK_SYSTEM_PROMPT,
  buildContext,
  createAskIndex,
  groupBySource,
  retrieve,
  searchQuery,
  type AskChunk,
  type AskNote,
  type AskSource,
  type AskTurn,
  type RetrievalBudget,
} from "@content/ask";
import { getAllNotes } from "./content.server";
import { OLLAMA_CONTEXT, OLLAMA_KEEP_ALIVE, OLLAMA_MODEL, OLLAMA_URL } from "./ollama.server";

// Con `react-router-serve` nadie carga el .env: se lee acá. En dev ya lo cargó vite.config.
const envFile = join(process.cwd(), ".env");
if (!process.env.LLM_PROVIDER && existsSync(envFile)) process.loadEnvFile(envFile);

type Provider = "ollama" | "anthropic";

const PROVIDER: Provider = process.env.LLM_PROVIDER?.trim().toLowerCase() === "anthropic" ? "anthropic" : "ollama";
const CLAUDE_MODEL = "claude-opus-5-5";

/**
 * Cuánto texto de la wiki entra por pregunta. El modelo local tiene una ventana
 * chica (y 6 GB de memoria de video): ~20.000 caracteres ≈ 6.000 tokens.
 */
const BUDGET: Record<Provider, RetrievalBudget> = {
  ollama: { maxChars: 20_000, maxChunks: 10 },
  anthropic: { maxChars: 160_000, maxChunks: 80 },
};
/** Con el modelo local el historial se acorta para que entre en la ventana. */
const OLLAMA_HISTORY = { turns: 4, charsPerTurn: 1_500 };

/* ------------------------------------------------------------- estado */

export interface ChatStatus {
  provider: Provider;
  /** Nombre legible del modelo, para mostrar en la página. */
  model: string;
  ready: boolean;
  /** Qué falta, si no está listo. */
  problem: "sin-clave" | "ollama-apagado" | "modelo-no-descargado" | null;
}

export async function chatStatus(): Promise<ChatStatus> {
  if (PROVIDER === "anthropic") {
    const ready = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
    return { provider: PROVIDER, model: "Claude Opus 5.5", ready, problem: ready ? null : "sin-clave" };
  }
  const base = { provider: PROVIDER, model: OLLAMA_MODEL };
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    const data = (await res.json()) as { models?: { name: string }[] };
    const wanted = OLLAMA_MODEL.includes(":") ? OLLAMA_MODEL : `${OLLAMA_MODEL}:latest`;
    const installed = (data.models ?? []).some((m) => m.name === wanted);
    return { ...base, ready: installed, problem: installed ? null : "modelo-no-descargado" };
  } catch {
    return { ...base, ready: false, problem: "ollama-apagado" };
  }
}

/**
 * Empieza a cargar el modelo local en memoria sin esperar el resultado: se llama
 * al abrir la página del chat, así la primera pregunta no espera la carga.
 */
export function warmUp(): void {
  if (PROVIDER !== "ollama") return;
  fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Sin prompt, Ollama solo carga el modelo. Misma ventana que las preguntas, para no recargarlo después.
    body: JSON.stringify({ model: OLLAMA_MODEL, keep_alive: OLLAMA_KEEP_ALIVE, options: { num_ctx: OLLAMA_CONTEXT } }),
  }).catch(() => {
    /* Si Ollama no está, la página ya lo avisa. */
  });
}

/* ------------------------------------------------------------ recuperación */

let cached: { notes: AskNote[]; index: MiniSearch<AskChunk>; byId: Map<string, AskChunk> } | null = null;

function searchable() {
  const notes = getAllNotes();
  // Mismo array mientras no cambie el contenido; si el vault cambió, se rearma el índice.
  if (!cached || cached.notes !== notes) cached = { notes, ...createAskIndex(notes) };
  return cached;
}

/* ------------------------------------------------------ límite de consultas */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

/** Devuelve los segundos a esperar, o 0 si la consulta puede pasar. */
export function rateLimit(key: string, now = Date.now()): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000);
  }
  recent.push(now);
  hits.set(key, recent);
  return 0;
}

/* ------------------------------------------------------------ respuesta */

export type AskEvent =
  | { type: "sources"; sources: AskSource[] }
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

/** Responde en streaming: primero las fuentes, después el texto a medida que llega. */
export async function* answer(question: string, history: AskTurn[], signal: AbortSignal): AsyncGenerator<AskEvent> {
  const { index, byId } = searchable();
  const groups = groupBySource(retrieve(index, byId, searchQuery(question, history), BUDGET[PROVIDER]));
  yield { type: "sources", sources: groups.map((g) => g.source) };

  const prompt = `${buildContext(groups)}\n\nPregunta: ${question}`;
  if (PROVIDER === "anthropic") yield* answerWithClaude(prompt, history, signal);
  else yield* answerWithOllama(prompt, history, signal);
}

/* ---------------------------------------------------------------- Ollama */

async function* answerWithOllama(prompt: string, history: AskTurn[], signal: AbortSignal): AsyncGenerator<AskEvent> {
  const past = history.slice(-OLLAMA_HISTORY.turns).map((t) => ({
    role: t.role,
    content: t.text.length > OLLAMA_HISTORY.charsPerTurn ? `${t.text.slice(0, OLLAMA_HISTORY.charsPerTurn)}…` : t.text,
  }));

  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        keep_alive: OLLAMA_KEEP_ALIVE,
        messages: [{ role: "system", content: ASK_SYSTEM_PROMPT }, ...past, { role: "user", content: prompt }],
        // Temperatura baja: se busca fidelidad a las notas, no creatividad.
        options: { num_ctx: OLLAMA_CONTEXT, temperature: 0.2 },
      }),
    });
  } catch (error) {
    if (signal.aborted) return;
    console.error("[preguntar] Ollama:", error);
    yield { type: "error", message: "No se pudo conectar con Ollama. Abrí la aplicación Ollama y probá de nuevo." };
    return;
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("[preguntar] Ollama", res.status, detail);
    yield {
      type: "error",
      message:
        res.status === 404
          ? `El modelo ${OLLAMA_MODEL} no está descargado. Corré "ollama pull ${OLLAMA_MODEL}".`
          : `Ollama devolvió un error (${res.status}). Probá de nuevo.`,
    };
    return;
  }

  // Ollama responde una línea JSON por fragmento de texto.
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
        if (chunk.error) {
          console.error("[preguntar] Ollama:", chunk.error);
          yield { type: "error", message: `Ollama no pudo terminar la respuesta: ${chunk.error}` };
          return;
        }
        if (chunk.message?.content) yield { type: "text", text: chunk.message.content };
        if (chunk.done) finished = true;
      }
    }
  } catch (error) {
    if (signal.aborted) return;
    console.error("[preguntar] Ollama:", error);
    yield { type: "error", message: "Se cortó la conexión con Ollama en medio de la respuesta." };
    return;
  }
  yield finished ? { type: "done" } : { type: "error", message: "La respuesta de Ollama quedó incompleta." };
}

/* ---------------------------------------------------------------- Claude */

let client: Anthropic | null = null;

async function* answerWithClaude(prompt: string, history: AskTurn[], signal: AbortSignal): AsyncGenerator<AskEvent> {
  client ??= new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-ASK_LIMITS.maxHistory).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: prompt },
  ];

  try {
    const stream = client.beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 64000,
        output_config: { effort: "medium" },
        // Si el modelo declina por política, la API reintenta con el modelo alternativo recomendado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: ASK_SYSTEM_PROMPT,
        messages,
      },
      { signal },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      yield { type: "error", message: "El modelo no respondió esta pregunta. Probá reformularla." };
      return;
    }
    if (final.stop_reason === "max_tokens") {
      yield { type: "error", message: "La respuesta quedó cortada por largo. Probá con una pregunta más acotada." };
      return;
    }
    yield { type: "done" };
  } catch (error) {
    if (signal.aborted) return;
    yield { type: "error", message: describeClaudeError(error) };
  }
}

function describeClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "La clave de la API no es válida. Revisá ANTHROPIC_API_KEY en el archivo .env y reiniciá GuiMind.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "La clave de la API no tiene permiso para usar este modelo.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Se alcanzó el límite de uso de la API. Probá de nuevo en un minuto.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "No hay conexión con la API de Claude. Revisá la conexión a internet.";
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[preguntar]", error.status, error.message);
    return `La API devolvió un error (${error.status ?? "sin código"}). Probá de nuevo en un rato.`;
  }
  console.error("[preguntar]", error);
  return "Algo salió mal al generar la respuesta. Probá de nuevo.";
}
