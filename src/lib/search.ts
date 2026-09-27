import type { Options, SearchOptions } from "minisearch";

/** Documento del índice de búsqueda. Uno por nota publicada. */
export interface SearchDoc {
  id: string; // slug
  title: string;
  aliases: string;
  tags: string;
  headings: string;
  text: string;
  folder: string;
  description: string;
}

export type SearchResultFields = Pick<SearchDoc, "title" | "folder" | "description">;

/** Palabras vacías frecuentes en español: no aportan a la búsqueda. */
const STOPWORDS = new Set(
  "a al algo como con de del el en entre es esta este la las lo los mas o para pero por que se sin sobre su sus un una uno y ya".split(
    " ",
  ),
);

/** "Energía" → "energia": se busca sin tildes ni mayúsculas. */
export function normalizeTerm(term: string): string | null {
  const t = term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return STOPWORDS.has(t) ? null : t;
}

export const searchQueryOptions: SearchOptions = {
  boost: { title: 5, aliases: 4, tags: 2, headings: 2 },
  prefix: true,
  // Tolera errores de tipeo solo en palabras de 5+ letras.
  fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
  combineWith: "AND",
};

/** Mismas opciones al indexar (build) y al cargar el índice (navegador). */
export const searchIndexOptions: Options<SearchDoc> = {
  fields: ["title", "aliases", "tags", "headings", "text"],
  storeFields: ["title", "folder", "description"],
  processTerm: normalizeTerm,
  searchOptions: searchQueryOptions,
};
