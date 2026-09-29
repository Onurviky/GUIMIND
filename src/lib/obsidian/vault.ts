import type { Root as HastRoot } from "hast";
import type { Paragraph, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { parseFrontmatter } from "./frontmatter";
import { stripComments } from "./preprocess";
import { createResolver, type NoteEntry } from "./resolve";
import { assetPathToSlug, basename, pathToSlug, slugify, stripExtension } from "./slug";
import { transformNote, type EmbedPlaceholder } from "./transform";
import type { Asset, Issue, IssueKind, Note, VaultFile, VaultResult } from "./types";

export interface ProcessOptions {
  /** Prefijo de las URLs de notas. */
  notesBase?: string;
  /** Prefijo de las URLs de assets. */
  assetsBase?: string;
  /** Profundidad máxima de embeds anidados. */
  maxEmbedDepth?: number;
  /** Publica todas las notas, sin exigir `publish: true` (vault de uso personal). */
  publishAll?: boolean;
}

interface Working {
  entry: NoteEntry;
  fm: ReturnType<typeof parseFrontmatter>;
  tree: Root;
  outLinks: Set<string>;
  tags: Set<string>;
  headings: Note["headings"];
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

const renderer = unified()
  .use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: "Notas al pie",
    footnoteBackLabel: "Volver al texto",
  })
  .use(rehypeTableWhitespace)
  .use(rehypeRaw)
  .use(rehypeSanitizeLight)
  .use(rehypeKatex, { throwOnError: false, strict: false })
  .use(rehypeStringify);

/**
 * Procesa el vault completo en memoria. Es una función pura respecto del disco:
 * recibe los archivos y devuelve notas, assets usados e incidencias.
 */
export function processVault(files: VaultFile[], options: ProcessOptions = {}): VaultResult {
  const notesBase = options.notesBase ?? "/notas";
  const assetsBase = options.assetsBase ?? "/vault";
  const maxDepth = options.maxEmbedDepth ?? 3;

  const issues: Issue[] = [];
  const report = (file: string) => (kind: IssueKind, message: string) =>
    issues.push({ kind, file, message });

  // 1. Índice de TODAS las notas (privadas incluidas: hacen falta para resolver links).
  const mdFiles = files.filter((f) => f.path.toLowerCase().endsWith(".md") && f.content != null);
  const assetPaths = files.filter((f) => !f.path.toLowerCase().endsWith(".md")).map((f) => f.path);

  const usedSlugs = new Set<string>();
  const parsed = mdFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => {
      const fm = parseFrontmatter(file.content!);
      const published = options.publishAll === true || fm.publish;
      if (fm.error) {
        report(file.path)(
          "invalid-frontmatter",
          `Frontmatter inválido (${fm.error}); ${published ? "se publica sin sus campos" : "la nota no se publica"}`,
        );
      }
      if (fm.publishNotBoolean && !published) {
        report(file.path)("publish-not-boolean", "`publish` no es booleano (¿\"true\" entre comillas?); la nota no se publica");
      }
      let slug = pathToSlug(file.path) || "nota";
      if (published) {
        if (usedSlugs.has(slug)) {
          let n = 2;
          while (usedSlugs.has(`${slug}-${n}`)) n++;
          report(file.path)("slug-collision", `La URL /${slug} ya existe; se usó /${slug}-${n}`);
          slug = `${slug}-${n}`;
        }
        usedSlugs.add(slug);
      }
      const entry: NoteEntry = {
        path: file.path,
        slug,
        published,
        title: fm.title ?? basename(stripExtension(file.path)),
      };
      return { entry, fm };
    });

  const resolver = createResolver(
    parsed.map((p) => p.entry),
    assetPaths,
  );

  const usedAssets = new Map<string, string>();
  const useAsset = (path: string) => {
    let url = usedAssets.get(path);
    if (!url) {
      url = `${assetsBase}/${assetPathToSlug(path)}`;
      usedAssets.set(path, url);
    }
    return url;
  };
  const noteUrl = (entry: NoteEntry, anchor?: string) =>
    `${notesBase}/${entry.slug}${anchor ? `#${encodeURIComponent(anchor).replace(/%5E/g, "^")}` : ""}`;

  // 2. Parseo y transformación de las notas publicadas.
  const working = new Map<string, Working>();
  for (const { entry, fm } of parsed) {
    if (!entry.published) continue;
    const tree = parser.parse(stripComments(fm.body)) as Root;
    const res = transformNote(tree, {
      file: entry.path,
      self: entry,
      resolver,
      noteUrl,
      useAsset,
      report: report(entry.path),
    });
    working.set(entry.path, { entry, fm, tree, ...res });
  }

  // 3. Embeds, HTML y texto plano.
  const notes: Note[] = [];
  for (const w of working.values()) {
    const tree = structuredClone(w.tree);
    dropDuplicateTitle(tree, w.entry.title);
    const expanded = expandEmbeds(tree, [w.entry.path], {
      working,
      maxDepth,
      noteUrl,
      report: report(w.entry.path),
    });
    const hast = renderer.runSync(expanded) as HastRoot;
    const html = String(renderer.stringify(hast));
    const text = plainText(w.tree);

    notes.push({
      slug: w.entry.slug,
      path: w.entry.path,
      title: w.entry.title,
      folder: w.entry.path.includes("/") ? w.entry.path.split("/")[0]! : "",
      aliases: w.fm.aliases,
      tags: [...new Set([...w.fm.tags, ...w.tags])].sort(),
      updated: w.fm.updated,
      description: w.fm.description ?? summarize(firstParagraph(w.tree) ?? text),
      html,
      headings: w.headings,
      outLinks: [...w.outLinks].sort(),
      backlinks: [],
      text,
    });
  }

  // 4. Backlinks.
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  for (const note of notes) {
    for (const target of note.outLinks) bySlug.get(target)?.backlinks.push(note.slug);
  }
  for (const note of notes) note.backlinks.sort();

  const assets: Asset[] = [...usedAssets].map(([source, url]) => ({ source, url }));
  return { notes: notes.sort((a, b) => a.slug.localeCompare(b.slug)), assets, issues };
}

// ---------------------------------------------------------------- embeds

interface EmbedContext {
  working: Map<string, Working>;
  maxDepth: number;
  noteUrl: (entry: NoteEntry, anchor?: string) => string;
  report: (kind: IssueKind, message: string) => void;
}

function expandEmbeds(tree: Root, stack: string[], ctx: EmbedContext): Root {
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;

    // Como en Obsidian, el embed se muestra como bloque aunque comparta línea con
    // texto: el párrafo se parte en [texto] [embed] [texto].
    if (node.type === "paragraph" && node.children.some((c) => c.type === "obsidianEmbed")) {
      const blocks: RootContent[] = [];
      let run: Paragraph["children"] = [];
      const flush = () => {
        if (run.some((c) => !(c.type === "text" && !c.value.trim()))) {
          blocks.push({ type: "paragraph", data: blocks.length === 0 ? node.data : undefined, children: run });
        }
        run = [];
      };
      for (const child of node.children) {
        if (child.type === "obsidianEmbed") {
          flush();
          blocks.push(renderEmbed(child, stack, ctx));
        } else {
          run.push(child);
        }
      }
      flush();
      parent.children.splice(index, 1, ...(blocks as never[]));
      return [SKIP, index + blocks.length];
    }

    // Embeds donde no cabe un bloque (encabezados, celdas de tabla): quedan como link.
    if (node.type === "obsidianEmbed") {
      const link = {
        type: "link" as const,
        url: ctx.noteUrl(node.target),
        data: { hProperties: { className: ["internal-link"] } },
        children: [{ type: "text" as const, value: node.label }],
      };
      parent.children.splice(index, 1, link as never);
      return [SKIP, index + 1];
    }
  });
  return tree;
}

function renderEmbed(embed: EmbedPlaceholder, stack: string[], ctx: EmbedContext): RootContent {
  const target = ctx.working.get(embed.target.path);
  const sourceLink = {
    type: "paragraph" as const,
    data: { hProperties: { className: ["note-embed-source"] } },
    children: [
      {
        type: "link" as const,
        url: ctx.noteUrl(embed.target),
        data: { hProperties: { className: ["internal-link"] } },
        children: [{ type: "text" as const, value: embed.label }],
      },
    ],
  };

  if (!target || stack.includes(embed.target.path) || stack.length > ctx.maxDepth) {
    ctx.report("embed-cycle", `Embed circular o demasiado anidado: ${embed.target.path}; se mostró como link`);
    return sourceLink as RootContent;
  }

  const clone = structuredClone(target.tree);
  let children = clone.children;
  if (embed.subpath) {
    const section = extractSection(clone, embed.subpath);
    if (!section) {
      ctx.report("broken-link", `Sección no encontrada: ![[${embed.target.title}#${embed.subpath}]]`);
      return sourceLink as RootContent;
    }
    children = section;
  }
  // Sin ids en el contenido embebido: evita ids duplicados en la página.
  const wrapper: Root = { type: "root", children };
  visit(wrapper, (n) => {
    const props = n.data?.hProperties;
    if (props && "id" in props) delete props.id;
  });
  expandEmbeds(wrapper, [...stack, embed.target.path], ctx);

  return {
    type: "blockquote",
    data: { hName: "div", hProperties: { className: ["note-embed"] } },
    children: [sourceLink, ...wrapper.children],
  } as RootContent;
}

function extractSection(tree: Root, subpath: string): RootContent[] | null {
  if (subpath.startsWith("^")) {
    let found: RootContent | null = null;
    visit(tree, (n) => {
      if (!found && n.data?.hProperties?.id === subpath) found = n as RootContent;
    });
    return found ? [found] : null;
  }
  const wanted = slugify(subpath.split("#").filter(Boolean).pop() ?? "");
  const start = tree.children.findIndex((n) => n.type === "heading" && slugify(toString(n)) === wanted);
  if (start === -1) return null;
  const head = tree.children[start] as { depth: number };
  let end = start + 1;
  while (end < tree.children.length) {
    const n = tree.children[end]!;
    if (n.type === "heading" && n.depth <= head.depth) break;
    end++;
  }
  return tree.children.slice(start, end);
}

// ---------------------------------------------------------------- utilidades

/** Si la nota empieza con un H1 igual al título, se omite (la página ya lo muestra). */
function dropDuplicateTitle(tree: Root, title: string) {
  const first = tree.children[0];
  if (first?.type === "heading" && first.depth === 1 && toString(first).trim() === title.trim()) {
    tree.children.shift();
  }
}

const BLOCK_TYPES = new Set(["paragraph", "heading", "list", "listItem", "blockquote", "table", "tableRow"]);

/** Texto plano, un bloque por línea (entra en callouts y listas), sin código ni fórmulas. */
function plainText(tree: Root): string {
  const parts: string[] = [];
  const walk = (nodes: RootContent[]) => {
    for (const node of nodes) {
      if (node.type === "code" || node.type === "math" || node.type === "html") continue;
      if ("children" in node && node.children.some((c) => BLOCK_TYPES.has(c.type))) {
        walk(node.children as RootContent[]);
        continue;
      }
      const t = toString(node).trim();
      if (t) parts.push(t);
    }
  };
  walk(tree.children);
  return parts.join("\n");
}

/** Primer párrafo de primer nivel con sustancia (los callouts no cuentan). */
function firstParagraph(tree: Root): string | null {
  for (const node of tree.children) {
    if (node.type !== "paragraph") continue;
    const t = toString(node).replace(/\s+/g, " ").trim();
    if (t.length > 40) return t;
  }
  return null;
}

/**
 * Resumen de la nota: frases completas hasta ~200 caracteres, para no cortar
 * una idea a la mitad. Solo recorta con "…" si la primera frase ya es muy larga.
 */
function summarize(text: string, max = 200): string {
  const first = text.split("\n").find((l) => l.trim().length > 40) ?? text.split("\n")[0] ?? "";
  // Lazy y con puntos internos permitidos: "Ley 27.520" o "S.A." no parten la frase.
  const sentences = first.match(/[^]+?[.!?]+(?=\s|$)|[^]+$/g) ?? [first];
  let out = "";
  for (const s of sentences) {
    // Con menos de 80 caracteres se sigue sumando: el "punto" pudo ser una abreviatura ("TPR S.A.").
    if (out.length >= 80 && (out + s).length > max) break;
    out += s;
  }
  out = out.trim();
  if (out.length <= max + 60) return out;
  const cut = out.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/**
 * Quita los saltos de línea entre filas y celdas: rehype-raw (parse5) los
 * saca fuera de la tabla y quedan como líneas vacías sueltas.
 */
function rehypeTableWhitespace() {
  const TABLE_PARTS = new Set(["table", "thead", "tbody", "tfoot", "tr"]);
  return (tree: HastRoot) => {
    visit(tree, "element", (node) => {
      if (!TABLE_PARTS.has(node.tagName)) return;
      node.children = node.children.filter((c) => !(c.type === "text" && !c.value.trim()));
    });
  };
}

/**
 * El vault es contenido propio, así que se permite HTML. Aun así se quitan
 * comentarios HTML (pueden tener notas privadas), scripts, handlers on* y autoplay.
 */
function rehypeSanitizeLight() {
  return (tree: HastRoot) => {
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;
      if (node.type === "comment" || (node.type === "element" && node.tagName === "script")) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (node.type === "element") {
        for (const key of Object.keys(node.properties)) {
          if (/^on/i.test(key) || key.toLowerCase() === "autoplay") delete node.properties[key];
        }
      }
    });
  };
}
