import { describe, expect, it } from "vitest";
import { parseAnswer } from "../src/lib/answer";
import { buildContext, chunkNote, createAskIndex, groupBySource, retrieve, searchQuery, type AskNote } from "../src/lib/ask";

const note = (slug: string, title: string, text: string, headings: string[] = []): AskNote => ({
  slug,
  title,
  folder: slug.split("/")[0]!,
  tags: [],
  headings,
  text,
});

const notes: AskNote[] = [
  note(
    "empresas/tpr",
    "TPR S.A. - Terminal Puerto Rosario",
    "Concesionaria de la terminal del puerto de Rosario.\nContrato\nLa concesión vence en 2032.",
    ["Contrato"],
  ),
  note("sectores/hidrocarburos", "Hidrocarburos", "Petróleo y gas de Vaca Muerta, gasoductos y GNL."),
  note("casos/molina", "Molina c. ENAPRO", "Reclamo laboral contra el ente administrador del puerto."),
];
const { index, byId } = createAskIndex(notes);
const budget = { maxChars: 20_000, maxChunks: 10 };

describe("fragmentos", () => {
  it("corta en cada sección y recuerda a qué sección pertenece", () => {
    const chunks = chunkNote(notes[0]!);
    expect(chunks.map((c) => [c.section, c.text])).toEqual([
      [null, "Concesionaria de la terminal del puerto de Rosario."],
      ["Contrato", "La concesión vence en 2032."],
    ]);
  });

  it("parte los bloques largos sin pasarse del máximo y sin perder texto", () => {
    const long = Array.from({ length: 60 }, (_, k) => `Frase número ${k} con algo de texto.`).join(" ");
    const chunks = chunkNote(note("a", "A", long), 300);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((c) => c.text.length <= 300)).toBe(true);
    expect(chunks.map((c) => c.text).join(" ").replace(/\s+/g, " ")).toBe(long);
  });
});

describe("recuperación", () => {
  it("encuentra el fragmento relevante, sin tildes ni mayúsculas", () => {
    const found = retrieve(index, byId, "¿Cuándo VENCE la concesion?", budget);
    expect(found[0]!.slug).toBe("empresas/tpr");
    expect(found[0]!.section).toBe("Contrato");
    expect(retrieve(index, byId, "petroleo", budget)[0]!.slug).toBe("sectores/hidrocarburos");
  });

  it("no devuelve nada si la pregunta no toca el vault", () => {
    expect(retrieve(index, byId, "receta de ñoquis", budget)).toEqual([]);
  });

  it("respeta el presupuesto de caracteres y de fragmentos", () => {
    const found = retrieve(index, byId, "puerto rosario concesión terminal", { maxChars: 60, maxChunks: 10 });
    expect(found.reduce((n, c) => n + c.text.length, 0)).toBeLessThanOrEqual(60);
    expect(retrieve(index, byId, "puerto", { maxChars: 20_000, maxChunks: 1 })).toHaveLength(1);
  });

  it("suma la pregunta anterior para las repreguntas", () => {
    expect(searchQuery("¿y cuándo vence?", [{ role: "user", text: "concesión de TPR" }, { role: "assistant", text: "..." }])).toBe(
      "¿y cuándo vence? concesión de TPR",
    );
  });
});

describe("contexto y fuentes", () => {
  it("agrupa por nota, numera por relevancia y ordena los fragmentos como en la nota", () => {
    const chunks = chunkNote(notes[0]!);
    const groups = groupBySource([chunks[1]!, ...chunkNote(notes[2]!), chunks[0]!]);
    expect(groups.map((g) => [g.source.n, g.source.slug])).toEqual([
      [1, "empresas/tpr"],
      [2, "casos/molina"],
    ]);
    expect(groups[0]!.chunks.map((c) => c.order)).toEqual([0, 1]);
    const ctx = buildContext(groups);
    expect(ctx).toContain('<nota numero="1" titulo="TPR S.A. - Terminal Puerto Rosario"');
    expect(ctx).toContain("[Sección: Contrato]");
  });

  it("avisa cuando no hay notas", () => {
    expect(buildContext([])).toContain("No se encontró ninguna nota");
  });
});

describe("respuesta", () => {
  it("separa párrafos, listas y citas", () => {
    const blocks = parseAnswer("La concesión vence en 2032 [1].\n\n- Puerto [1][2]\n- Otro dato [9]", new Set([1, 2]));
    expect(blocks[0]).toEqual({
      type: "p",
      inlines: [{ type: "text", text: "La concesión vence en 2032 " }, { type: "ref", n: 1 }, { type: "text", text: "." }],
    });
    expect(blocks[1]!.type).toBe("ul");
    // [9] no es una fuente: queda como texto.
    const items = (blocks[1] as Extract<(typeof blocks)[number], { type: "ul" }>).items;
    expect(items[1]).toEqual([{ type: "text", text: "Otro dato [9]" }]);
  });

  it("separa un párrafo seguido de lista sin línea en blanco y quita negritas", () => {
    const blocks = parseAnswer("Hay dos casos:\n- **Uno** [1]\n- Dos", new Set([1]));
    expect(blocks.map((b) => b.type)).toEqual(["p", "ul"]);
    expect(JSON.stringify(blocks)).not.toContain("**");
  });
});
