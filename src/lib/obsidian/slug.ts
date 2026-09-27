/**
 * "Energía Solar Térmica" → "energia-solar-termica".
 * Se quitan tildes para que las URLs sean legibles y estables al copiarlas.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Conceptos/Potencia pico.md" → "conceptos/potencia-pico". */
export function pathToSlug(path: string): string {
  return stripExtension(path)
    .split("/")
    .map(slugify)
    .filter(Boolean)
    .join("/");
}

/** Igual que pathToSlug pero conserva la extensión (para assets). */
export function assetPathToSlug(path: string): string {
  const ext = extname(path);
  return pathToSlug(path) + ext.toLowerCase();
}

export function stripExtension(path: string): string {
  const ext = extname(path);
  return ext ? path.slice(0, -ext.length) : path;
}

export function extname(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i) : "";
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Genera ids de encabezados únicos dentro de una nota ("resumen", "resumen-1"...). */
export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text) || "seccion";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };
}

/** URL de la página de un tag. Los tags anidados ("solar/termica") mantienen la jerarquía. */
export function tagUrl(tag: string): string {
  return "/tags/" + tag.split("/").map(slugify).join("/");
}
