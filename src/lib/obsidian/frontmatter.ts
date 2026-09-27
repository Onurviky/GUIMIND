import matter from "gray-matter";

export interface ParsedFrontmatter {
  /** Solo true si el frontmatter dice exactamente `publish: true` (booleano). */
  publish: boolean;
  /** true cuando `publish` existe pero no es booleano (ej: "true" entre comillas). */
  publishNotBoolean: boolean;
  title: string | null;
  aliases: string[];
  tags: string[];
  updated: string | null;
  description: string | null;
  data: Record<string, unknown>;
  body: string;
  error: string | null;
}

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  let data: Record<string, unknown> = {};
  let body = raw;
  let error: string | null = null;
  try {
    // Pasar opciones desactiva la caché de gray-matter (devuelve objetos compartidos).
    const parsed = matter(raw, {});
    data = parsed.data ?? {};
    body = parsed.content;
  } catch (e) {
    // Un YAML inválido deja la nota como privada: ante la duda, no se publica.
    error = e instanceof Error ? e.message.split("\n")[0]! : String(e);
    body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  }

  return {
    publish: data.publish === true,
    publishNotBoolean: "publish" in data && typeof data.publish !== "boolean",
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : null,
    aliases: toStringList(data.aliases ?? data.alias),
    tags: toStringList(data.tags ?? data.tag, /[,\s]+/).map(normalizeTag).filter(Boolean),
    updated: toIsoDate(data.updated ?? data.modified ?? data.date),
    description:
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : null,
    data,
    body,
    error,
  };
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function toStringList(value: unknown, splitter = /,/): string[] {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : String(value).split(splitter);
  return list
    .filter((v) => v != null)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}
