/**
 * Cliente de la API de Claude, compartido por el chat y por los resúmenes de
 * Novedades. ANTHROPIC_API_KEY vive solo en el servidor: nunca llega al navegador.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync } from "node:fs";
import { join } from "node:path";

// Con `react-router-serve` nadie carga el .env: se lee acá. En dev ya lo cargó vite.config.
const envFile = join(process.cwd(), ".env");
if (!process.env.ANTHROPIC_API_KEY && existsSync(envFile)) process.loadEnvFile(envFile);

export const CLAUDE_MODEL = "claude-opus-5-5";
export const CLAUDE_MODEL_NAME = "Claude Opus 5.5";

/** Si el modelo declina por política, la API reintenta con el modelo alternativo recomendado. */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;

export function claude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** Respuesta completa en texto. Lanza un Error con un mensaje claro si algo falla. */
export async function claudeText(system: string, prompt: string, signal?: AbortSignal): Promise<string> {
  try {
    const stream = claude().beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        output_config: { effort: "low" },
        ...FALLBACK,
        system,
        messages: [{ role: "user", content: prompt }],
      },
      { signal },
    );
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("El modelo no quiso resumir esta nota.");
    const text = final.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim();
    if (!text) throw new Error("El modelo no devolvió texto.");
    return text;
  } catch (error) {
    if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) {
      throw new Error(describeClaudeError(error));
    }
    throw error;
  }
}

export function describeClaudeError(error: unknown): string {
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
    console.error("[claude]", error.status, error.message);
    return `La API devolvió un error (${error.status ?? "sin código"}). Probá de nuevo en un rato.`;
  }
  console.error("[claude]", error);
  return "Algo salió mal al generar la respuesta. Probá de nuevo.";
}
