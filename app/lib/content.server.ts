/**
 * Acceso al contenido generado. Solo se ejecuta en loaders, que en este sitio
 * corren en el build (prerender): nada de esto llega al bundle del cliente.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ManifestEntry, NoteRef } from "@content/content-types";
import type { GraphData } from "@content/graph";
import type { ToolLinks } from "@src/calc/catalog";
import type { Note } from "@content/obsidian/types";

const dir = join(process.cwd(), "generated");

let cache: {
  notes: Map<string, Note>;
  manifest: ManifestEntry[];
  graph: GraphData;
  tools: ToolLinks[];
} | null = null;

const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dir, file), "utf8"));

function load() {
  // En desarrollo se relee siempre para ver los cambios del vault sin reiniciar.
  if (cache && process.env.NODE_ENV === "production") return cache;
  const notes = read<Note[]>("notes.json");
  cache = {
    notes: new Map(notes.map((n) => [n.slug, n])),
    manifest: read<ManifestEntry[]>("manifest.json"),
    graph: read<GraphData>("graph.json"),
    tools: read<ToolLinks[]>("tools.json"),
  };
  return cache;
}

export function getGraph(): GraphData {
  return load().graph;
}

export function getManifest(): ManifestEntry[] {
  return load().manifest;
}

export function getNote(slug: string): Note | null {
  return load().notes.get(slug) ?? null;
}

export function getRefs(slugs: string[]): NoteRef[] {
  const { notes } = load();
  return slugs
    .map((s) => notes.get(s))
    .filter((n): n is Note => n != null)
    .map(({ slug, title, description }) => ({ slug, title, description }));
}

/** Notas del vault que explican los conceptos de una calculadora (solo las publicadas). */
export function getToolNotes(id: string): ToolLinks["notes"] {
  return load().tools.find((t) => t.id === id)?.notes ?? [];
}
