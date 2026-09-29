import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { parseAnswer, type AnswerInline } from "@content/answer";
import type { AskSource, AskTurn } from "@content/ask";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { ArrowRight } from "~/components/icons";
import { chatStatus, warmUp, type ChatStatus } from "~/lib/ask.server";
import { getManifest } from "~/lib/content.server";
import { site } from "~/site";
import type { Route } from "./+types/preguntar";

export async function loader() {
  // Sugerencias armadas con lo que existe en la wiki (nada inventado):
  // los sectores y el proyecto más referenciado.
  const manifest = getManifest();
  const inbound = new Map<string, number>();
  for (const n of manifest) for (const t of n.links) inbound.set(t, (inbound.get(t) ?? 0) + 1);
  const byRefs = (a: { slug: string }, b: { slug: string }) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0);
  const sectors = manifest.filter((n) => n.folder === "sectores").sort(byRefs).map((n) => n.title).slice(0, 3);
  const project = manifest.filter((n) => n.folder === "proyectos").sort(byRefs)[0]?.title ?? null;
  const status = await chatStatus();
  if (status.ready) warmUp();
  return { status, sectors, project };
}

export function meta() {
  return [
    { title: `Preguntale al cerebro · ${site.name}` },
    { name: "description", content: "Preguntas respondidas solo con el contenido de la wiki, con la fuente de cada dato." },
  ];
}

interface Exchange {
  question: string;
  answer: string;
  sources: AskSource[];
  error: string | null;
  done: boolean;
}

const STORAGE_KEY = "guimind:preguntar";

export default function Preguntar({ loaderData }: Route.ComponentProps) {
  const { status, sectors, project } = loaderData;
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // La conversación y el borrador sobreviven a recargar la página o volver atrás.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved?.exchanges) setExchanges(saved.exchanges.map((e: Exchange) => ({ ...e, done: true })));
      if (typeof saved?.draft === "string") setDraft(saved.draft);
    } catch {
      /* sin almacenamiento: se empieza de cero */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ exchanges, draft }));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }, [exchanges, draft]);

  const update = (i: number, patch: (e: Exchange) => Partial<Exchange>) =>
    setExchanges((list) => list.map((e, k) => (k === i ? { ...e, ...patch(e) } : e)));

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: AskTurn[] = exchanges
      .filter((e) => e.done && !e.error && e.answer)
      .flatMap((e) => [
        { role: "user" as const, text: e.question },
        { role: "assistant" as const, text: e.answer },
      ]);
    const i = exchanges.length;
    setExchanges((list) => [...list, { question: q, answer: "", sources: [], error: null, done: false }]);
    setDraft("");
    setBusy(true);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/preguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error("sin cuerpo");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "sources") update(i, () => ({ sources: event.sources }));
          else if (event.type === "text") update(i, (e) => ({ answer: e.answer + event.text }));
          else if (event.type === "error") update(i, () => ({ error: event.message }));
        }
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      update(i, () => ({
        error: aborted ? "Detuviste la respuesta." : "No se pudo conectar con el servidor de GuiMind. ¿Sigue abierta su ventana?",
      }));
    } finally {
      update(i, () => ({ done: true }));
      setBusy(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  const suggestions = [
    ...sectors.map((s) => `¿Cuál es la situación actual en ${s}?`),
    ...(project ? [`¿En qué estado está ${project}?`] : []),
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 pb-12 pt-12 sm:px-6 md:pt-16">
      <header>
        <p className="eyebrow reveal" style={{ "--i": 0 } as React.CSSProperties}>
          Preguntale al cerebro
        </p>
        <h1 className="reveal mt-3 text-4xl sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>
          Preguntá con tus palabras, respondé con tus notas.
        </h1>
        <p className="reveal mt-4 text-lg text-muted" style={{ "--i": 2 } as React.CSSProperties}>
          Responde solo con lo que está en la wiki y cita la nota de cada dato. Si la wiki no cubre algo, lo dice en
          vez de inventar.
        </p>
        <p className="reveal mt-3 text-base text-muted" style={{ "--i": 3 } as React.CSSProperties}>
          {status.provider === "ollama"
            ? `Responde ${status.model}, un modelo que corre en esta computadora: gratis y sin mandar nada a internet. Es más lento y menos preciso que un modelo en la nube; revisá las fuentes.`
            : `Responde ${status.model} a través de la API de Anthropic. Cada pregunta tiene un costo de uso.`}
        </p>
      </header>

      {!status.ready ? (
        <SetupNotice status={status} />
      ) : (
        <>
          {exchanges.length === 0 && (
            <section aria-labelledby="ejemplos" className="mt-10">
              <h2 id="ejemplos" className="font-sans text-sm font-semibold uppercase tracking-wider text-muted">
                Para empezar
              </h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => ask(s)}
                      className="card flex min-h-14 w-full items-center justify-between gap-3 p-4 text-left text-base font-medium text-ink"
                    >
                      {s}
                      <ArrowRight className="size-4 shrink-0 text-amber-text" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ol className="mt-10 space-y-12" aria-label="Conversación">
            {exchanges.map((e, i) => (
              <li key={i}>
                <ExchangeView exchange={e} onRetry={busy ? undefined : () => ask(e.question)} />
              </li>
            ))}
          </ol>
          <div ref={endRef} />

          <p className="sr-only" aria-live="polite">
            {busy ? "Buscando en las notas y redactando la respuesta." : ""}
          </p>

          <form
            className="sticky bottom-0 mt-10 border-t border-border bg-bg pb-4 pt-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              ask(draft);
            }}
          >
            <label htmlFor="pregunta" className="text-base font-semibold">
              Tu pregunta
            </label>
            <textarea
              id="pregunta"
              ref={inputRef}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                  ev.preventDefault();
                  ask(draft);
                }
              }}
              rows={3}
              maxLength={2000}
              placeholder="Ej: ¿qué obligaciones tiene TPR según el contrato de concesión?"
              className="mt-2 block w-full resize-y rounded-sm border border-border bg-surface p-3 text-base text-ink placeholder:text-muted focus:border-link"
              aria-describedby="pregunta-ayuda"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p id="pregunta-ayuda" className="text-sm text-muted">
                Enter para preguntar · Shift + Enter para un salto de línea
              </p>
              <div className="flex flex-wrap gap-3">
                {exchanges.length > 0 && !busy && (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="min-h-11 rounded-sm border border-border bg-surface px-4 font-semibold text-ink hover:bg-surface-2"
                  >
                    Borrar conversación
                  </button>
                )}
                {busy ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="min-h-11 rounded-sm border border-border bg-surface px-4 font-semibold text-ink hover:bg-surface-2"
                  >
                    Detener respuesta
                  </button>
                ) : (
                  <button type="submit" className="btn-primary" disabled={!draft.trim()}>
                    Preguntar al cerebro
                    <ArrowRight />
                  </button>
                )}
              </div>
            </div>
          </form>

          <ConfirmDialog
            open={confirmClear}
            title="¿Borrar la conversación?"
            description="Se borran todas las preguntas y respuestas de esta pantalla. Las notas de la wiki no cambian."
            confirmLabel="Borrar conversación"
            cancelLabel="Mantener conversación"
            onCancel={() => setConfirmClear(false)}
            onConfirm={() => {
              setExchanges([]);
              setConfirmClear(false);
              inputRef.current?.focus();
            }}
          />
        </>
      )}
    </div>
  );
}

function ExchangeView({ exchange: e, onRetry }: { exchange: Exchange; onRetry?: () => void }) {
  const valid = new Set(e.sources.map((s) => s.n));
  const bySource = new Map(e.sources.map((s) => [s.n, s]));
  const cited = new Set([...e.answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
  // Se listan primero las fuentes citadas; las demás se consultaron pero no se usaron.
  const used = e.sources.filter((s) => cited.has(s.n));
  const blocks = parseAnswer(e.answer, valid);

  const renderInlines = (parts: AnswerInline[]) =>
    parts.map((p, k) => {
      if (p.type === "text") return <span key={k}>{p.text}</span>;
      const s = bySource.get(p.n)!;
      return (
        <sup key={k} className="mx-0.5">
          <Link
            to={`/notas/${s.slug}`}
            title={s.title}
            aria-label={`Fuente ${p.n}: ${s.title}`}
            className="inline-grid min-w-5 place-items-center rounded-sm bg-surface-2 px-1 text-xs font-semibold no-underline hover:bg-amber hover:text-on-amber"
          >
            {p.n}
          </Link>
        </sup>
      );
    });

  return (
    <article>
      <h2 className="border-l-2 border-l-ink pl-4 font-display text-2xl">{e.question}</h2>

      <div className="mt-5 space-y-4 text-lg leading-relaxed">
        {blocks.map((b, k) =>
          b.type === "p" ? (
            <p key={k}>{renderInlines(b.inlines)}</p>
          ) : (
            <ul key={k} className="list-disc space-y-1.5 pl-6 marker:text-amber-text">
              {b.items.map((item, j) => (
                <li key={j}>{renderInlines(item)}</li>
              ))}
            </ul>
          ),
        )}
        {!e.done && (
          <p className="flex items-center gap-2 text-base text-muted">
            <span className="size-2 animate-pulse rounded-full bg-amber" aria-hidden="true" />
            {e.answer ? "Redactando…" : e.sources.length ? `Leyendo ${e.sources.length} notas…` : "Buscando en las notas…"}
          </p>
        )}
        {e.error && (
          <div role="alert" className="border-l-2 border-l-[var(--c-warning)] bg-surface-2 p-4 text-base">
            <p>{e.error}</p>
            {e.done && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 min-h-11 rounded-sm border border-border bg-surface px-4 font-medium text-ink hover:border-ink"
              >
                Volver a preguntar
              </button>
            )}
          </div>
        )}
      </div>

      {e.done && e.sources.length > 0 && (
        <details className="mt-6 border-t border-border pt-4" open={used.length > 0}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold uppercase tracking-wider text-muted">
            {used.length > 0
              ? `Fuentes citadas (${used.length} de ${e.sources.length} notas consultadas)`
              : `Notas consultadas (${e.sources.length})`}
          </summary>
          <ol className="mt-2 space-y-1">
            {(used.length > 0 ? used : e.sources).map((s) => (
              <li key={s.n} className="flex min-h-11 items-baseline gap-3 py-2 text-base">
                <span className="w-6 shrink-0 font-semibold tabular-nums text-amber-text">{s.n}</span>
                <span>
                  <Link to={`/notas/${s.slug}`} viewTransition>
                    {s.title}
                  </Link>{" "}
                  <span className="text-sm text-muted">· {s.folder || "raíz"}</span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

/** Qué falta para que el chat funcione, con los pasos exactos. */
function SetupNotice({ status }: { status: ChatStatus }) {
  const code = "rounded-sm bg-surface-2 px-1.5 py-0.5 text-ink";
  return (
    <section className="card mt-10 border-l-2 border-l-ink p-6" aria-labelledby="config">
      {status.problem === "sin-clave" ? (
        <>
          <h2 id="config" className="font-sans text-xl font-semibold">
            Falta configurar la clave de la API de Claude
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-base text-muted">
            <li>
              Creá una clave en <span className="text-ink">console.anthropic.com</span>, sección API Keys.
            </li>
            <li>
              En el archivo <code className={code}>.env</code> de la carpeta de GuiMind agregá:{" "}
              <code className={code}>ANTHROPIC_API_KEY=tu-clave</code>
            </li>
            <li>Cerrá la ventana de GuiMind y abrila de nuevo con “Iniciar GuiMind”.</li>
          </ol>
          <p className="mt-4 text-base text-muted">
            O usá el modelo local y gratuito: poné <code className={code}>LLM_PROVIDER=ollama</code> en el{" "}
            <code className={code}>.env</code>.
          </p>
        </>
      ) : status.problem === "ollama-apagado" ? (
        <>
          <h2 id="config" className="font-sans text-xl font-semibold">
            Ollama no está abierto
          </h2>
          <p className="mt-3 text-base text-muted">
            El chat usa el modelo local <span className="text-ink">{status.model}</span>, que corre con Ollama. Abrí la
            aplicación Ollama desde el menú Inicio y recargá esta página.
          </p>
        </>
      ) : (
        <>
          <h2 id="config" className="font-sans text-xl font-semibold">
            Falta descargar el modelo {status.model}
          </h2>
          <p className="mt-3 text-base text-muted">
            Abrí una terminal y corré <code className={code}>ollama pull {status.model}</code>. Es una descarga única de
            unos 5 GB. Cuando termine, recargá esta página.
          </p>
        </>
      )}
    </section>
  );
}
