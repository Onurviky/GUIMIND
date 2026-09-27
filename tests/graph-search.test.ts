import MiniSearch from "minisearch";
import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "../src/lib/content-types";
import { computeGraph, folderSlots } from "../src/lib/graph";
import { normalizeTerm, searchIndexOptions, type SearchDoc } from "../src/lib/search";

const entry = (slug: string, folder: string, links: string[] = []): ManifestEntry => ({
  slug,
  title: slug.toUpperCase(),
  folder,
  tags: [],
  description: "",
  updated: null,
  links,
});

describe("grafo", () => {
  const manifest = [
    entry("a", "Conceptos", ["b", "c"]),
    entry("b", "Conceptos", ["a"]),
    entry("c", "Mercado", ["zzz-privada"]),
    entry("d", "Regulación"),
    entry("e", "Tecnologías"),
    entry("f", "Tecnologías"),
  ];

  it("links no dirigidos, sin duplicados ni destinos inexistentes", () => {
    const g = computeGraph(manifest);
    expect(g.links).toHaveLength(2); // a-b (una vez) y a-c
    expect(g.nodes.find((n) => n.id === "a")!.degree).toBe(2);
    expect(g.nodes.find((n) => n.id === "d")!.degree).toBe(0);
  });

  it("layout determinístico y dentro de los límites", () => {
    const g1 = computeGraph(manifest);
    const g2 = computeGraph(manifest);
    expect(g1.nodes.map((n) => [n.x, n.y])).toEqual(g2.nodes.map((n) => [n.x, n.y]));
    for (const n of g1.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(g1.width);
      expect(n.y).toBeLessThan(g1.height);
    }
  });

  it("solo 3 carpetas con color; orden estable por cantidad y nombre", () => {
    const slots = folderSlots(manifest);
    expect(slots.map((f) => [f.name, f.slot])).toEqual([
      ["Conceptos", 0],
      ["Tecnologías", 1],
      ["Mercado", 2],
      ["Regulación", null],
    ]);
  });
});

describe("búsqueda", () => {
  const docs: SearchDoc[] = [
    { id: "energia", title: "Potencia y energía", aliases: "kW vs kWh", tags: "fundamentos", headings: "", text: "La energía se mide en kWh", folder: "Conceptos", description: "" },
    { id: "pico", title: "Potencia pico", aliases: "", tags: "solar", headings: "", text: "kWp en condiciones estándar", folder: "Conceptos", description: "" },
    { id: "gd", title: "Generación distribuida", aliases: "Usuario-generador", tags: "regulacion", headings: "Autoconsumo", text: "Ley 27.424", folder: "Regulación", description: "" },
  ];
  // Mismo camino que en producción: se serializa en el build y se carga en el navegador.
  const built = new MiniSearch(searchIndexOptions);
  built.addAll(docs);
  const index = MiniSearch.loadJSON<SearchDoc>(JSON.stringify(built), searchIndexOptions);
  const ids = (q: string) => index.search(q).map((r) => r.id);

  it("ignora tildes y mayúsculas", () => {
    expect(normalizeTerm("Energía")).toBe("energia");
    expect(ids("ENERGIA")).toContain("energia");
    expect(ids("generacion")).toEqual(["gd"]);
  });
  it("busca por prefijo mientras se escribe", () => {
    expect(ids("distri")).toEqual(["gd"]);
  });
  it("el título pesa más que el texto", () => {
    expect(ids("potencia")[0]).toBeDefined();
    expect(ids("pico")[0]).toBe("pico");
  });
  it("encuentra por alias y encabezados", () => {
    expect(ids("usuario-generador")).toContain("gd");
    expect(ids("autoconsumo")).toEqual(["gd"]);
  });
  it("tolera un error de tipeo en palabras largas", () => {
    expect(ids("distribuída")).toEqual(["gd"]);
    expect(ids("generasion")).toEqual(["gd"]);
  });
  it("combina palabras con Y", () => {
    expect(ids("potencia pico")).toEqual(["pico"]);
  });
  it("las palabras vacías no restringen", () => {
    expect(ids("la potencia de pico")).toEqual(["pico"]);
  });
});
