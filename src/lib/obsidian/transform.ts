import type {
  Blockquote,
  Data,
  Heading as MdHeading,
  Link,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
} from "mdast";
import { toString } from "mdast-util-to-string";
import { SKIP, visit } from "unist-util-visit";
import { visitParents } from "unist-util-visit-parents";
import { normalizeTag } from "./frontmatter";
import {
  AUDIO_EXT,
  IMAGE_EXT,
  VIDEO_EXT,
  isMarkdownTarget,
  splitTarget,
  subpathToAnchor,
  type NoteEntry,
  type Resolver,
} from "./resolve";
import { basename, createSlugger, extname, slugify, tagUrl } from "./slug";
import type { Heading, IssueKind } from "./types";

/** Nodo temporal para `![[nota]]`: se reemplaza por el contenido en expandEmbeds. */
export interface EmbedPlaceholder {
  type: "obsidianEmbed";
  data?: Data;
  target: NoteEntry;
  subpath: string | null;
  label: string;
}

declare module "mdast" {
  interface PhrasingContentMap {
    obsidianEmbed: EmbedPlaceholder;
  }
  interface RootContentMap {
    obsidianEmbed: EmbedPlaceholder;
  }
}

export interface TransformContext {
  file: string;
  self: NoteEntry;
  resolver: Resolver;
  noteUrl: (entry: NoteEntry, anchor?: string) => string;
  /** Registra un asset usado por una nota publicada y devuelve su URL pública. */
  useAsset: (path: string) => string;
  report: (kind: IssueKind, message: string) => void;
}

export interface TransformResult {
  outLinks: Set<string>;
  tags: Set<string>;
  headings: Heading[];
}

const INLINE =
  /(!?)\[\[([^\[\]\n]+?)\]\]|==([^=\n]+?)==|(^|[\s(])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

export function transformNote(tree: Root, ctx: TransformContext): TransformResult {
  const result: TransformResult = { outLinks: new Set(), tags: new Set(), headings: [] };

  removeDataview(tree, ctx);
  transformInline(tree, ctx, result);
  transformMarkdownLinks(tree, ctx, result);
  transformCallouts(tree);
  assignBlockIds(tree);
  result.headings = assignHeadingIds(tree);
  return result;
}

// ---------------------------------------------------------------- Dataview

function removeDataview(tree: Root, ctx: TransformContext) {
  let removed = 0;
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;
    const isBlock = node.type === "code" && /^dataview(js)?$/i.test(node.lang ?? "");
    const isInline = node.type === "inlineCode" && /^\$?=\s/.test(node.value);
    if (isBlock || isInline) {
      parent.children.splice(index, 1);
      removed++;
      return [SKIP, index];
    }
  });
  if (removed > 0) {
    ctx.report("dataview-removed", `${removed} consulta(s) Dataview ocultas (no se ejecutan en la web)`);
  }
}

// ------------------------------------------- wikilinks, embeds, tags, ==resaltado==

function transformInline(tree: Root, ctx: TransformContext, result: TransformResult) {
  visitParents(tree, "text", (node, ancestors) => {
    // Texto dentro de links: se deja como está.
    if (ancestors.some((a) => a.type === "link" || a.type === "linkReference")) return;
    const parent = ancestors[ancestors.length - 1];
    if (!parent || !("children" in parent)) return;

    const replacement = tokenize(node.value, ctx, result);
    if (!replacement) return;
    const children = parent.children as Nodes[];
    const index = children.indexOf(node);
    children.splice(index, 1, ...replacement);
    return [SKIP, index + replacement.length];
  });
}

function tokenize(
  value: string,
  ctx: TransformContext,
  result: TransformResult,
): PhrasingContent[] | null {
  const out: PhrasingContent[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  for (let m = INLINE.exec(value); m; m = INLINE.exec(value)) {
    const [whole, bang, inner, highlight, tagLead, tag] = m;
    let start = m.index;
    let nodes: PhrasingContent[];

    if (inner !== undefined) {
      nodes = bang ? embed(inner, ctx, result) : wikilink(inner, ctx, result);
    } else if (highlight !== undefined) {
      nodes = [
        { type: "emphasis", data: { hName: "mark" }, children: [{ type: "text", value: highlight }] },
      ];
    } else if (tag !== undefined) {
      start += tagLead!.length;
      const key = normalizeTag(tag);
      result.tags.add(key);
      nodes = [
        {
          type: "link",
          url: tagUrl(key),
          data: { hProperties: { className: ["tag"] } },
          children: [{ type: "text", value: `#${tag}` }],
        },
      ];
    } else {
      continue;
    }

    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    out.push(...nodes);
    last = m.index + whole.length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function splitAlias(inner: string): [string, string | null] {
  const i = inner.indexOf("|");
  if (i === -1) return [inner.trim(), null];
  return [inner.slice(0, i).trim(), inner.slice(i + 1).trim() || null];
}

function wikilink(inner: string, ctx: TransformContext, result: TransformResult): PhrasingContent[] {
  const [raw, alias] = splitAlias(inner);
  // Sin alias se muestra el nombre de la nota sin carpetas: [[Carpeta/Nota#Sec]] → "Nota › Sec".
  const [path = "", ...subs] = raw.split("#");
  const name = path.slice(path.lastIndexOf("/") + 1);
  const label = alias ?? [name, ...subs].filter(Boolean).join(" › ");
  return linkTo(raw, label, ctx, result);
}

/** Link interno (wikilink o markdown). Si no se puede publicar, queda como texto plano. */
function linkTo(
  raw: string,
  label: string,
  ctx: TransformContext,
  result: TransformResult,
  children?: PhrasingContent[],
): PhrasingContent[] {
  const { linkpath, subpath } = splitTarget(raw);
  const plain = children ?? [{ type: "text", value: label }];
  const entry = linkpath ? resolveNoteReporting(linkpath, raw, ctx) : ctx.self;
  if (!entry) return plain;
  if (!entry.published) {
    // No se expone la URL ni el título real de la nota privada.
    ctx.report("private-link", `Link a nota no publicada: [[${raw}]]`);
    return plain;
  }
  if (entry !== ctx.self) result.outLinks.add(entry.slug);
  const anchor = subpath ? subpathToAnchor(subpath, slugify) : undefined;
  const link: Link = {
    type: "link",
    url: ctx.noteUrl(entry, anchor),
    data: { hProperties: { className: ["internal-link"] } },
    children: plain,
  };
  return [link];
}

function resolveNoteReporting(linkpath: string, raw: string, ctx: TransformContext): NoteEntry | null {
  const { target, ambiguous } = ctx.resolver.resolveNote(linkpath);
  if (!target) {
    ctx.report("broken-link", `Link roto: [[${raw}]] (no existe la nota)`);
    return null;
  }
  if (ambiguous) {
    ctx.report("ambiguous-link", `[[${raw}]] coincide con varias notas; se usó ${target.path}`);
  }
  return target;
}

function embed(inner: string, ctx: TransformContext, result: TransformResult): PhrasingContent[] {
  const [raw, alias] = splitAlias(inner);
  const { linkpath, subpath } = splitTarget(raw);

  if (!isMarkdownTarget(linkpath)) return embedAsset(linkpath, alias, ctx);

  const entry = linkpath ? resolveNoteReporting(linkpath, raw, ctx) : ctx.self;
  if (!entry) return [];
  if (!entry.published) {
    ctx.report("private-embed", `Embed de nota no publicada omitido: ![[${raw}]]`);
    return [];
  }
  if (entry !== ctx.self) result.outLinks.add(entry.slug);
  return [{ type: "obsidianEmbed", target: entry, subpath, label: alias ?? entry.title }];
}

function embedAsset(linkpath: string, alias: string | null, ctx: TransformContext): PhrasingContent[] {
  const { target } = ctx.resolver.resolveAsset(linkpath);
  if (!target) {
    ctx.report("missing-asset", `Archivo no encontrado: ![[${linkpath}]]`);
    return [];
  }
  const url = ctx.useAsset(target);
  const ext = extname(target).toLowerCase();
  const name = basename(target);

  if (IMAGE_EXT.has(ext)) {
    // ![[img.png|300]] o ![[img.png|300x200]] definen tamaño; otro texto es el alt.
    const size = alias?.match(/^(\d+)(?:x(\d+))?$/);
    const hProperties: Record<string, string> = { loading: "lazy", decoding: "async" };
    if (size?.[1]) hProperties.width = size[1];
    if (size?.[2]) hProperties.height = size[2];
    return [{ type: "image", url, alt: size ? "" : (alias ?? ""), data: { hProperties } }];
  }
  if (AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext)) {
    // Siempre con controles y sin autoplay.
    const tag = AUDIO_EXT.has(ext) ? "audio" : "video";
    return [
      {
        type: "link",
        url,
        data: { hName: tag, hProperties: { src: url, controls: true, preload: "metadata" } },
        children: [{ type: "text", value: name }],
      },
    ];
  }
  return [
    {
      type: "link",
      url,
      data: { hProperties: { className: ["file-link"], download: "" } },
      children: [{ type: "text", value: `Descargar ${alias ?? name}` }],
    },
  ];
}

// ------------------------------------------- links e imágenes markdown estándar

function transformMarkdownLinks(tree: Root, ctx: TransformContext, result: TransformResult) {
  const dir = ctx.file.includes("/") ? ctx.file.slice(0, ctx.file.lastIndexOf("/")) : "";

  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;
    if (node.type !== "link" && node.type !== "image") return;
    if (node.data?.hProperties) return; // ya generado por nosotros
    const url = node.url;
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") || url.startsWith("//")) return;

    const raw = safeDecode(url);
    const { linkpath } = splitTarget(raw);
    const resolved = joinPath(dir, linkpath);

    if (node.type === "image" || !isMarkdownTarget(linkpath)) {
      const found =
        ctx.resolver.resolveAsset(resolved).target ?? ctx.resolver.resolveAsset(linkpath).target;
      if (!found) {
        ctx.report("missing-asset", `Archivo no encontrado: ${url}`);
        if (node.type === "image") parent.children.splice(index, 1);
        return;
      }
      node.url = ctx.useAsset(found);
      return;
    }

    const target = ctx.resolver.resolveNote(resolved).target ? resolved : linkpath;
    const hash = raw.includes("#") ? raw.slice(raw.indexOf("#")) : "";
    const replacement = linkTo(target + hash, toString(node), ctx, result, node.children);
    parent.children.splice(index, 1, ...(replacement as RootContent[]));
    return [SKIP, index + replacement.length];
  });
}

function joinPath(dir: string, rel: string): string {
  if (rel.startsWith("/")) return rel.slice(1);
  const parts = dir ? dir.split("/") : [];
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------- callouts

const CALLOUT_FAMILY: Record<string, string> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  important: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

const CALLOUT_TITLE: Record<string, string> = {
  note: "Nota",
  abstract: "Resumen",
  info: "Info",
  todo: "Pendiente",
  tip: "Consejo",
  success: "Listo",
  question: "Pregunta",
  warning: "Atención",
  failure: "Falla",
  danger: "Peligro",
  bug: "Bug",
  example: "Ejemplo",
  quote: "Cita",
};

const CALLOUT_HEAD = /^\[!([\w-]+)\]([+-]?)[ \t]*/;

function transformCallouts(tree: Root) {
  visit(tree, "blockquote", (node: Blockquote) => {
    const first = node.children[0];
    if (first?.type !== "paragraph") return;
    const head = first.children[0];
    if (head?.type !== "text") return;
    const m = CALLOUT_HEAD.exec(head.value);
    if (!m) return;

    const rawType = m[1]!.toLowerCase();
    const family = CALLOUT_FAMILY[rawType] ?? (CALLOUT_TITLE[rawType] ? rawType : "note");
    const fold = m[2] as "" | "+" | "-";
    head.value = head.value.slice(m[0].length);

    // El título es lo que queda en la primera línea; el resto del párrafo es contenido.
    const titleNodes: PhrasingContent[] = [];
    const restNodes: PhrasingContent[] = [];
    let inTitle = true;
    for (const child of first.children) {
      if (inTitle && child.type === "text" && child.value.includes("\n")) {
        const i = child.value.indexOf("\n");
        titleNodes.push({ type: "text", value: child.value.slice(0, i) });
        const after = child.value.slice(i + 1);
        if (after) restNodes.push({ type: "text", value: after });
        inTitle = false;
      } else if (inTitle && child.type === "break") {
        inTitle = false;
      } else {
        (inTitle ? titleNodes : restNodes).push(child);
      }
    }
    const hasTitle = titleNodes.some((n) => toString(n).trim() !== "");
    const title: PhrasingContent[] = hasTitle
      ? titleNodes
      : [{ type: "text", value: CALLOUT_TITLE[rawType] ?? capitalize(rawType) }];

    const body: RootContent[] = [];
    if (restNodes.length > 0) body.push({ type: "paragraph", children: restNodes });
    body.push(...node.children.slice(1));

    const foldable = fold !== "";
    const titleNode: Paragraph = {
      type: "paragraph",
      data: {
        hName: foldable ? "summary" : "div",
        hProperties: { className: ["callout-title"] },
      },
      children: title,
    };
    const content = {
      type: "blockquote",
      data: { hName: "div", hProperties: { className: ["callout-content"] } },
      children: body,
    } as Blockquote;

    node.data = {
      hName: foldable ? "details" : "div",
      hProperties: {
        className: ["callout"],
        dataCallout: family,
        ...(fold === "+" ? { open: true } : {}),
      },
    };
    node.children = [titleNode, content] as Blockquote["children"];
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------- ids de bloques y encabezados

const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;

function assignBlockIds(tree: Root) {
  visit(tree, "paragraph", (node: Paragraph, _index, parent) => {
    const last = node.children[node.children.length - 1];
    if (last?.type !== "text") return;
    const m = BLOCK_ID.exec(last.value);
    if (!m) return;
    last.value = last.value.slice(0, m.index);
    // En listas compactas el <p> no se renderiza: el id va en el <li>.
    const target = parent?.type === "listItem" ? parent : node;
    target.data = { ...target.data, hProperties: { ...target.data?.hProperties, id: `^${m[1]}` } };
  });
}

function assignHeadingIds(tree: Root): Heading[] {
  const slugger = createSlugger();
  const headings: Heading[] = [];
  visit(tree, "heading", (node: MdHeading) => {
    const text = toString(node).trim();
    const id = slugger(text);
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    headings.push({ depth: node.depth, text, id });
  });
  return headings;
}
