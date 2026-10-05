import { ASK_LIMITS, type AskTurn } from "@content/ask";
import { answer, chatStatus, rateLimit, type AskEvent } from "~/lib/ask.server";
import type { Route } from "./+types/api.preguntar";

/**
 * POST /api/preguntar  { question, history }
 * Responde NDJSON: una línea por evento (fuentes, fragmentos de texto, fin o error).
 */
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return json({ type: "error", message: "Usá POST." }, 405);
  if (!chatStatus().ready) {
    return json({ type: "error", message: "Falta ANTHROPIC_API_KEY en el archivo .env." }, 503);
  }

  const wait = rateLimit(request.headers.get("x-forwarded-for") ?? "local");
  if (wait > 0) {
    return json({ type: "error", message: `Hiciste muchas preguntas seguidas. Esperá ${wait} segundos.` }, 429);
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return json({ type: "error", message: "Escribí una pregunta." }, 400);
  if (question.length > ASK_LIMITS.maxQuestion) {
    return json(
      { type: "error", message: `La pregunta es muy larga: el máximo es ${ASK_LIMITS.maxQuestion} caracteres.` },
      400,
    );
  }
  const history = parseHistory(body?.history);

  // Si el navegador corta (botón "Detener respuesta"), se corta también la generación.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of answer(question, history, abort.signal)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
        controller.close();
      } catch {
        // El navegador cerró la conexión: no hay a quién mandarle nada.
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function json(event: AskEvent, status: number) {
  return new Response(JSON.stringify(event) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

/** Historial que manda el navegador: se valida y se descarta lo que no tenga forma de turno. */
function parseHistory(value: unknown): AskTurn[] {
  if (!Array.isArray(value)) return [];
  const turns = value
    .filter(
      (t): t is AskTurn =>
        t != null &&
        (t.role === "user" || t.role === "assistant") &&
        typeof t.text === "string" &&
        t.text.trim().length > 0,
    )
    .slice(-ASK_LIMITS.maxHistory)
    .map((t) => ({ role: t.role, text: t.text.slice(0, 20_000) }));
  // La API exige que la conversación empiece con el usuario.
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
