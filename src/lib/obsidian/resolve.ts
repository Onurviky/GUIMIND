import { basename, extname, stripExtension } from "./slug";

export interface NoteEntry {
  path: string;
  slug: string;
  published: boolean;
  title: string;
}

export interface Resolution<T> {
  target: T | null;
  /** Hubo más de un candidato; se eligió el de ruta más corta. */
  ambiguous: boolean;
}

export interface LinkTarget {
  /** "Nota" o "Carpeta/Nota" (sin #). Vacío = la propia nota. */
  linkpath: string;
  /** Lo que sigue al primer "#": encabezado ("Resumen") o bloque ("^abc"). */
  subpath: string | null;
}

export function splitTarget(raw: string): LinkTarget {
  const i = raw.indexOf("#");
  if (i === -1) return { linkpath: raw.trim(), subpath: null };
  const sub = raw.slice(i + 1).trim();
  return { linkpath: raw.slice(0, i).trim(), subpath: sub || null };
}

/** Ancla HTML para un subpath: "^abc" → "^abc", "A#B" → id del último encabezado. */
export function subpathToAnchor(subpath: string, slugifyHeading: (s: string) => string): string {
  if (subpath.startsWith("^")) return subpath;
  const parts = subpath.split("#").filter(Boolean);
  return slugifyHeading(parts[parts.length - 1] ?? subpath);
}

/**
 * Resuelve links como Obsidian: por nombre de archivo sin importar mayúsculas,
 * o por ruta parcial si el link incluye carpetas. Con varios candidatos,
 * gana la ruta más corta y se marca como ambiguo.
 */
export function createResolver(notes: NoteEntry[], assetPaths: string[]) {
  const notesByName = groupBy(notes, (n) => basename(stripExtension(n.path)).toLowerCase());
  const assetsByName = groupBy(assetPaths, (p) => basename(p).toLowerCase());

  function pick<T>(candidates: T[], getPath: (t: T) => string): Resolution<T> {
    if (candidates.length === 0) return { target: null, ambiguous: false };
    const sorted = [...candidates].sort(
      (a, b) => getPath(a).length - getPath(b).length || getPath(a).localeCompare(getPath(b)),
    );
    return { target: sorted[0]!, ambiguous: candidates.length > 1 };
  }

  function resolveNote(linkpath: string): Resolution<NoteEntry> {
    const clean = normalize(linkpath).replace(/\.md$/i, "");
    if (!clean) return { target: null, ambiguous: false };
    if (!clean.includes("/")) {
      return pick(notesByName.get(clean) ?? [], (n) => n.path);
    }
    const matches = notes.filter((n) => {
      const p = stripExtension(n.path).toLowerCase();
      return p === clean || p.endsWith("/" + clean);
    });
    return pick(matches, (n) => n.path);
  }

  function resolveAsset(linkpath: string): Resolution<string> {
    const clean = normalize(linkpath);
    if (!clean) return { target: null, ambiguous: false };
    if (!clean.includes("/")) return pick(assetsByName.get(clean) ?? [], (p) => p);
    const matches = assetPaths.filter((p) => {
      const lp = p.toLowerCase();
      return lp === clean || lp.endsWith("/" + clean);
    });
    return pick(matches, (p) => p);
  }

  return { resolveNote, resolveAsset };
}

export type Resolver = ReturnType<typeof createResolver>;

export function isMarkdownTarget(linkpath: string): boolean {
  const ext = extname(linkpath).toLowerCase();
  // Obsidian permite puntos en nombres de nota ("v2.1 Tarifa"): solo es asset
  // si la extensión es de archivo conocido.
  return ext === "" || ext === ".md" || !KNOWN_ASSET_EXT.has(ext);
}

export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp"]);
export const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".ogv"]);
export const KNOWN_ASSET_EXT = new Set([
  ...IMAGE_EXT,
  ...AUDIO_EXT,
  ...VIDEO_EXT,
  ".pdf",
  ".csv",
  ".xlsx",
  ".docx",
  ".pptx",
  ".zip",
]);

function normalize(linkpath: string): string {
  let p = linkpath.trim();
  try {
    p = decodeURI(p);
  } catch {
    // Si no es URI válida se usa tal cual.
  }
  return p.replace(/\\/g, "/").replace(/^\.?\//, "").toLowerCase();
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
