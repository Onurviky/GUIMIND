/** Archivo crudo del vault, tal como se lee del disco (ruta relativa con "/"). */
export interface VaultFile {
  path: string;
  /** Contenido de texto; solo para .md. */
  content?: string;
}

export interface Heading {
  depth: number;
  text: string;
  id: string;
}

/** Nota publicada y procesada. Es lo que consume la app. */
export interface Note {
  slug: string;
  /** Ruta en el vault, ej: "Conceptos/Potencia pico.md". */
  path: string;
  title: string;
  /** Carpeta de primer nivel ("" si está en la raíz). */
  folder: string;
  aliases: string[];
  tags: string[];
  /** Solo si el frontmatter la declara (`updated`, `modified` o `date`). ISO yyyy-mm-dd. */
  updated: string | null;
  description: string;
  html: string;
  headings: Heading[];
  /** Slugs de notas publicadas a las que enlaza (incluye embeds). */
  outLinks: string[];
  /** Slugs de notas publicadas que enlazan a esta. */
  backlinks: string[];
  /** Texto plano, para búsqueda y chat. */
  text: string;
}

export type IssueKind =
  | "broken-link"
  | "ambiguous-link"
  | "private-link"
  | "private-embed"
  | "embed-cycle"
  | "missing-asset"
  | "dataview-removed"
  | "slug-collision"
  | "publish-not-boolean"
  | "invalid-frontmatter";

export interface Issue {
  kind: IssueKind;
  /** Ruta de la nota donde se detectó. */
  file: string;
  message: string;
}

export interface Asset {
  /** Ruta en el vault. */
  source: string;
  /** URL pública, ej: "/vault/adjuntos/diagrama.png". */
  url: string;
}

export interface VaultResult {
  notes: Note[];
  assets: Asset[];
  issues: Issue[];
}
