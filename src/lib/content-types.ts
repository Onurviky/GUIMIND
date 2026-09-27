/** Entrada liviana del índice de notas (generated/manifest.json). */
export interface ManifestEntry {
  slug: string;
  title: string;
  folder: string;
  tags: string[];
  description: string;
  updated: string | null;
  /** Slugs de las notas publicadas a las que enlaza. */
  links: string[];
}

export interface NoteRef {
  slug: string;
  title: string;
  description: string;
}
