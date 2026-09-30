/**
 * Acceso al contenido generado. Solo se ejecuta en loaders, que en este sitio
 * corren en el build (prerender) o en el servidor local: nada de esto llega al bundle del cliente.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AskNote } from "@content/ask";
import type { ManifestEntry, NoteRef } from "@content/content-types";
import type { GraphData } from "@content/graph";
import type { Note } from "@content/obsidian/types";

const dir = join(process.cwd(), "generated");

let cache: {
  mtime: number;
  list: AskNote[];
  notes: Map<string, Note>;
  manifest: ManifestEntry[];
  graph: GraphData;
} | null = null;

const read = <T,>(file: string): T => JSON.parse(readFileSync(join(dir, file), "utf8"));

function load() {
  // Se relee solo si el build de contenido cambió (el vault se editó con el sitio abierto).
  const mtime = statSync(join(dir, "notes.json")).mtimeMs;
  if (cache && cache.mtime === mtime) return cache;
  const notes = read<Note[]>("notes.json");
  cache = {
    mtime,
    list: notes.map(({ slug, title, folder, tags, headings, text }) => ({
      slug,
      title,
      folder,
      tags,
      headings: headings.map((h) => h.text),
      text,
    })),
    notes: new Map(notes.map((n) => [n.slug, n])),
    manifest: read<ManifestEntry[]>("manifest.json"),
    graph: read<GraphData>("graph.json"),
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

/** Todas las notas para el chat. Mismo array mientras no cambie el contenido. */
export function getAllNotes(): AskNote[] {
  return load().list;
}
