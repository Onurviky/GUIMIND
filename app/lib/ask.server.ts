/**
 * Servidor del chat "Preguntale al cerebro". Responde con la API de Claude
 * (necesita ANTHROPIC_API_KEY en el .env).
 */
import type Anthropic from "@anthropic-ai/sdk";
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
import { CLAUDE_MODEL, CLAUDE_MODEL_NAME, FALLBACK, claude, describeClaudeError, hasApiKey } from "./claude.server";
import { getAllNotes } from "./content.server";

/** Cuánto texto de la wiki entra por pregunta. */
const BUDGET: RetrievalBudget = { maxChars: 160_000, maxChunks: 80 };

/* ------------------------------------------------------------- estado */

export interface ChatStatus {
  /** Nombre legible del modelo, para mostrar en la página. */
  model: string;
  ready: boolean;
  /** Qué falta, si no está listo. */
  problem: "sin-clave" | null;
}

export function chatStatus(): ChatStatus {
  const ready = hasApiKey();
  return { model: CLAUDE_MODEL_NAME, ready, problem: ready ? null : "sin-clave" };
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
  const groups = groupBySource(retrieve(index, byId, searchQuery(question, history), BUDGET));
  yield { type: "sources", sources: groups.map((g) => g.source) };

  const prompt = `${buildContext(groups)}\n\nPregunta: ${question}`;
  yield* answerWithClaude(prompt, history, signal);
}

/* ---------------------------------------------------------------- Claude */

async function* answerWithClaude(prompt: string, history: AskTurn[], signal: AbortSignal): AsyncGenerator<AskEvent> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-ASK_LIMITS.maxHistory).map((t) => ({ role: t.role, content: t.text })),
    { role: "user", content: prompt },
  ];

  try {
    const stream = claude().beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 64000,
        output_config: { effort: "medium" },
        ...FALLBACK,
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
