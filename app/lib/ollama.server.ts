/**
 * Configuración y llamadas al modelo local (Ollama), compartidas por el chat y
 * por los resúmenes de Novedades.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

// Con `react-router-serve` nadie carga el .env: se lee acá. En dev ya lo cargó vite.config.
const envFile = join(process.cwd(), ".env");
if (!process.env.OLLAMA_MODEL && existsSync(envFile)) process.loadEnvFile(envFile);

export const OLLAMA_URL = (process.env.OLLAMA_URL?.trim() || "http://localhost:11434").replace(/\/$/, "");
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || "qwen2.5:7b";
/**
 * Cuánto tiempo queda el modelo cargado en memoria después de usarlo. Cargarlo
 * desde el disco lleva minutos; ya cargado, una respuesta lleva segundos.
 */
export const OLLAMA_KEEP_ALIVE = "30m";
/**
 * Ventana de contexto (tokens). Es la misma para el chat y los resúmenes: si
 * cambia entre pedidos, Ollama recarga el modelo, y eso lleva minutos.
 */
export const OLLAMA_CONTEXT = 12_288;

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

/** Respuesta completa (sin streaming). Lanza un Error con un mensaje claro si algo falla. */
export async function ollamaChat(
  messages: OllamaMessage[],
  options: { numCtx: number; signal?: AbortSignal },
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        messages,
        options: { num_ctx: options.numCtx, temperature: 0.2 },
      }),
    });
  } catch {
    throw new Error("Ollama no está abierto.");
  }
  if (res.status === 404) throw new Error(`El modelo ${OLLAMA_MODEL} no está descargado en Ollama.`);
  if (!res.ok) throw new Error(`Ollama devolvió un error (${res.status}).`);
  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (data.error) throw new Error(`Ollama: ${data.error}`);
  const text = data.message?.content?.trim();
  if (!text) throw new Error("El modelo no devolvió texto.");
  return text;
}
