import { describe, expect, it } from "vitest";
import { stripComments } from "../src/lib/obsidian/preprocess";
import { parseFrontmatter } from "../src/lib/obsidian/frontmatter";
import { createResolver } from "../src/lib/obsidian/resolve";
import { pathToSlug, slugify } from "../src/lib/obsidian/slug";
import { processVault } from "../src/lib/obsidian/vault";
import type { VaultFile } from "../src/lib/obsidian/types";

const pub = (body: string, extra = "") => `---\npublish: true\n${extra}---\n${body}`;

function run(files: Record<string, string | null>) {
  const list: VaultFile[] = Object.entries(files).map(([path, content]) =>
    content === null ? { path } : { path, content },
  );
  const result = processVault(list);
  const note = (slug: string) => {
    const n = result.notes.find((x) => x.slug === slug);
    if (!n) throw new Error(`No se publicó ${slug}`);
    return n;
  };
  const kinds = result.issues.map((i) => i.kind);
  return { ...result, note, kinds };
}

describe("slug", () => {
  it("quita tildes y normaliza", () => {
    expect(slugify("Energía Solar Térmica")).toBe("energia-solar-termica");
    expect(pathToSlug("Regulación/Ley 27.424 – Generación distribuida.md")).toBe(
      "regulacion/ley-27-424-generacion-distribuida",
    );
  });
});

describe("frontmatter", () => {
  it("solo publica con publish: true booleano", () => {
    expect(parseFrontmatter("---\npublish: true\n---\nx").publish).toBe(true);
    const str = parseFrontmatter('---\npublish: "true"\n---\nx');
    expect(str.publish).toBe(false);
    expect(str.publishNotBoolean).toBe(true);
    expect(parseFrontmatter("sin frontmatter").publish).toBe(false);
  });

  it("normaliza tags, aliases y fecha", () => {
    const fm = parseFrontmatter("---\ntags: [Solar, '#Tarifas']\naliases: FV\nupdated: 2026-03-10\n---\n");
    expect(fm.tags).toEqual(["solar", "tarifas"]);
    expect(fm.aliases).toEqual(["FV"]);
    expect(fm.updated).toBe("2026-03-10");
  });

  it("YAML inválido no rompe y no publica", () => {
    const fm = parseFrontmatter("---\npublish: true\n  mal: [\n---\ncuerpo");
    expect(fm.error).not.toBeNull();
    expect(fm.publish).toBe(false);
  });
});

describe("comentarios %%", () => {
  it("elimina comentarios en línea y multilínea", () => {
    expect(stripComments("a %%secreto%% b")).toBe("a  b");
    expect(stripComments("uno\n%%\nprivado\n%%\ndos")).toBe("uno\ndos");
  });
  it("respeta bloques de código", () => {
    const md = "```\n50%% de algo\n```";
    expect(stripComments(md)).toBe(md);
  });
  it("un %% sin cerrar comenta el resto", () => {
    expect(stripComments("visible\n%% todo lo que sigue\nprivado")).toBe("visible");
  });
});

describe("resolución de links", () => {
  const r = createResolver(
    [
      { path: "A/Nota.md", slug: "a/nota", published: true, title: "Nota" },
      { path: "B/Sub/Nota.md", slug: "b/sub/nota", published: true, title: "Nota" },
      { path: "Única.md", slug: "unica", published: true, title: "Única" },
    ],
    ["Adjuntos/diagrama.png"],
  );
  it("sin importar mayúsculas", () => {
    expect(r.resolveNote("única").target?.path).toBe("Única.md");
  });
  it("con ambigüedad elige la ruta más corta", () => {
    const res = r.resolveNote("Nota");
    expect(res.target?.path).toBe("A/Nota.md");
    expect(res.ambiguous).toBe(true);
  });
  it("con ruta parcial desambigua", () => {
    const res = r.resolveNote("Sub/Nota");
    expect(res.target?.path).toBe("B/Sub/Nota.md");
    expect(res.ambiguous).toBe(false);
  });
  it("assets por nombre", () => {
    expect(r.resolveAsset("Diagrama.PNG").target).toBe("Adjuntos/diagrama.png");
  });
});

describe("wikilinks", () => {
  it("link, alias y encabezado", () => {
    const { note } = run({
      "Origen.md": pub("Ver [[Destino]], [[Destino|el otro]] y [[Destino#Cómo se calcula]]."),
      "Destino.md": pub("## Cómo se calcula\nTexto"),
    });
    const html = note("origen").html;
    expect(html).toContain('<a href="/notas/destino" class="internal-link">Destino</a>');
    expect(html).toContain(">el otro</a>");
    expect(html).toContain('href="/notas/destino#como-se-calcula"');
    expect(note("destino").html).toContain('id="como-se-calcula"');
  });

  it("link roto: se reporta y se muestra como texto, sin romper", () => {
    const { note, kinds } = run({ "A.md": pub("Ver [[No existe]].") });
    expect(note("a").html).toContain("Ver No existe.");
    expect(kinds).toContain("broken-link");
  });

  it("link a nota privada: texto plano, sin URL", () => {
    const { note, kinds, notes } = run({
      "A.md": pub("Ver [[Secreta|esto]]."),
      "Secreta.md": "Contenido privado",
    });
    expect(notes).toHaveLength(1);
    expect(note("a").html).toContain("Ver esto.");
    expect(note("a").html).not.toContain("secreta");
    expect(kinds).toContain("private-link");
  });

  it("no toca wikilinks dentro de código", () => {
    const { note } = run({ "A.md": pub("`[[Destino]]`\n\n```\n[[Destino]]\n```") });
    expect(note("a").html).not.toContain("<a");
  });

  it("links markdown a .md relativos", () => {
    const { note } = run({
      "X/A.md": pub("[otra](../Y/B.md) y [misma](B%20C.md)"),
      "Y/B.md": pub("b"),
      "X/B C.md": pub("c"),
    });
    const html = note("x/a").html;
    expect(html).toContain('href="/notas/y/b"');
    expect(html).toContain('href="/notas/x/b-c"');
  });
});

describe("backlinks", () => {
  it("cada nota sabe quién la referencia (solo publicadas)", () => {
    const { note } = run({
      "A.md": pub("[[C]]"),
      "B.md": pub("[[C]] y [[C]]"),
      "Privada.md": "[[C]]",
      "C.md": pub("c"),
    });
    expect(note("c").backlinks).toEqual(["a", "b"]);
    expect(note("a").outLinks).toEqual(["c"]);
  });
});

describe("embeds", () => {
  it("embed de nota completa y de sección", () => {
    const { note } = run({
      "A.md": pub("![[B]]\n\n![[B#Dos]]"),
      "B.md": pub("## Uno\ntexto uno\n## Dos\ntexto dos"),
    });
    const html = note("a").html;
    expect(html.match(/class="note-embed"/g)).toHaveLength(2);
    expect(html).toContain("texto uno");
    // La sección "Dos" aparece dos veces (embed completo + sección); "uno", solo una.
    expect(html.match(/texto dos/g)).toHaveLength(2);
    expect(html.match(/texto uno/g)).toHaveLength(1);
  });

  it("embed en la misma línea que texto: se parte el párrafo", () => {
    const { note } = run({ "A.md": pub("Ver ![[B]] y seguir"), "B.md": pub("contenido B") });
    const html = note("a").html;
    expect(html).toMatch(/<p>Ver <\/p>\s*<div class="note-embed">[\s\S]*contenido B[\s\S]*<\/div>\s*<p> y seguir<\/p>/);
  });

  it("embed de bloque ^id", () => {
    const { note } = run({
      "A.md": pub("![[B#^clave]]"),
      "B.md": pub("irrelevante\n\nel dato clave ^clave"),
    });
    expect(note("a").html).toContain("el dato clave");
    expect(note("a").html).not.toContain("irrelevante");
  });

  it("embed de nota privada se omite", () => {
    const { note, kinds } = run({ "A.md": pub("antes\n\n![[P]]"), "P.md": "privado" });
    expect(note("a").html).not.toContain("privado");
    expect(kinds).toContain("private-embed");
  });

  it("embeds circulares no cuelgan el build", () => {
    const { note, kinds } = run({ "A.md": pub("a\n\n![[B]]"), "B.md": pub("b\n\n![[A]]") });
    expect(note("a").html).toContain("b");
    expect(kinds).toContain("embed-cycle");
  });

  it("imágenes con tamaño y registro de assets usados", () => {
    const { note, assets, kinds } = run({
      "A.md": pub("![[Diagrama Solar.png|300]]\n\n![[falta.png]]"),
      "Adjuntos/Diagrama Solar.png": null,
      "Adjuntos/no-usada.png": null,
    });
    expect(note("a").html).toContain('src="/vault/adjuntos/diagrama-solar.png"');
    expect(note("a").html).toContain('width="300"');
    expect(assets.map((a) => a.source)).toEqual(["Adjuntos/Diagrama Solar.png"]);
    expect(kinds).toContain("missing-asset");
  });

  it("audio y video sin autoplay", () => {
    const { note } = run({ "A.md": pub("![[charla.mp3]]"), "charla.mp3": null });
    expect(note("a").html).toContain("<audio");
    expect(note("a").html).toContain("controls");
    expect(note("a").html).not.toContain("autoplay");
  });
});

describe("tags", () => {
  it("inline y frontmatter, sin falsos positivos", () => {
    const { note } = run({
      "A.md": pub("Sobre #solar y #Energía/Renovable. No es tag: #123 ni a#b ni #30/50.\n\n# Título", "tags: tarifas\n"),
    });
    const n = note("a");
    expect(n.tags).toEqual(["energía/renovable", "solar", "tarifas"]);
    expect(n.html).toContain('href="/tags/solar"');
    expect(n.html).toContain('href="/tags/energia/renovable"');
    expect(n.html).toContain("#123");
  });
});

describe("callouts", () => {
  it("con título, tipo y contenido", () => {
    const { note } = run({ "A.md": pub("> [!warning] Ojo con la tarifa\n> El cargo fijo no baja.") });
    const html = note("a").html;
    expect(html).toContain('data-callout="warning"');
    expect(html).toContain('<div class="callout-title">Ojo con la tarifa</div>');
    expect(html).toContain("El cargo fijo no baja.");
  });
  it("título por defecto en español y alias de tipo", () => {
    const { note } = run({ "A.md": pub("> [!tip]\n> contenido\n\n> [!caution]\n> x") });
    expect(note("a").html).toContain(">Consejo<");
    expect(note("a").html).toContain('data-callout="warning"');
  });
  it("plegables con details/summary", () => {
    const { note } = run({ "A.md": pub("> [!faq]- ¿Qué es un kWp?\n> Potencia pico.") });
    const html = note("a").html;
    expect(html).toContain('<details class="callout" data-callout="question">');
    expect(html).toContain("<summary");
  });
  it("blockquote normal no se toca", () => {
    const { note } = run({ "A.md": pub("> cita común") });
    expect(note("a").html).toContain("<blockquote>");
  });
});

describe("privacidad y limpieza", () => {
  it("nada es público por defecto", () => {
    const { notes } = run({ "A.md": "hola", "B.md": "---\ntags: x\n---\nhola" });
    expect(notes).toHaveLength(0);
  });
  it("comentarios %% y HTML no llegan al HTML", () => {
    const { note } = run({ "A.md": pub("visible %%oculto%%\n\n<!-- tampoco -->") });
    expect(note("a").html).not.toContain("oculto");
    expect(note("a").html).not.toContain("tampoco");
  });
  it("oculta Dataview y lo reporta", () => {
    const { note, kinds } = run({ "A.md": pub("```dataview\nLIST FROM #solar\n```\n\nValor: `= this.x`") });
    expect(note("a").html).not.toContain("LIST FROM");
    expect(note("a").html).not.toContain("this.x");
    expect(kinds).toContain("dataview-removed");
  });
  it("quita scripts y handlers", () => {
    const { note } = run({ "A.md": pub('<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">') });
    expect(note("a").html).not.toContain("script");
    expect(note("a").html).not.toContain("onerror");
  });
  it("detecta slugs duplicados", () => {
    const { notes, kinds } = run({ "Tarifa.md": pub("a"), "tarifa!.md": pub("b") });
    expect(notes.map((n) => n.slug).sort()).toEqual(["tarifa", "tarifa-2"]);
    expect(kinds).toContain("slug-collision");
  });
});

describe("otros", () => {
  it("resaltado, math y H1 duplicado del título", () => {
    const { note } = run({ "Potencia.md": pub("# Potencia\n\n==clave== y $E = P \\cdot t$") });
    const html = note("potencia").html;
    expect(html).toContain("<mark>clave</mark>");
    expect(html).toContain("katex");
    expect(html).not.toContain("<h1");
  });
  it("link con carpeta muestra solo el nombre de la nota", () => {
    const { note } = run({ "A.md": pub("[[X/Destino]] y [[X/Destino#Parte]]"), "X/Destino.md": pub("## Parte") });
    expect(note("a").html).toContain(">Destino</a>");
    expect(note("a").html).toContain(">Destino › Parte</a>");
  });

  it("la descripción usa el primer párrafo, no los callouts", () => {
    const { note } = run({
      "A.md": pub(
        "> [!note] Aviso\n> Texto del callout que es bastante largo para contar.\n\nEste es el párrafo real que describe la nota completa.",
      ),
    });
    expect(note("a").description).toBe("Este es el párrafo real que describe la nota completa.");
    expect(note("a").text).toContain("Aviso\nTexto del callout");
  });

  it("título desde frontmatter y descripción automática", () => {
    const { note } = run({
      "a.md": pub("Un párrafo lo bastante largo como para servir de descripción de la nota.", "title: Mi título\n"),
    });
    expect(note("a").title).toBe("Mi título");
    expect(note("a").description).toContain("Un párrafo");
  });
});

describe("casos de tablas y listas", () => {
  it("wikilink con alias escapado dentro de una tabla", () => {
    const { note } = run({
      "A.md": pub("| a | b |\n|---|---|\n| [[B\\|alias]] | x |"),
      "B.md": pub("b"),
    });
    expect(note("a").html).toContain('<td><a href="/notas/b" class="internal-link">alias</a></td>');
  });
  it("id de bloque en ítem de lista", () => {
    const { note } = run({ "A.md": pub("- item ^blk") });
    expect(note("a").html).toContain('<li id="^blk">item</li>');
  });
});

describe("descripción", () => {
  it("corta en frases completas, sin dejar una idea a la mitad", () => {
    const long =
      "La potencia es la velocidad a la que se consume o genera energía. Se mide en kilowatts (kW). La energía es la potencia sostenida en el tiempo. Se mide en kilowatt-hora (kWh).";
    const { note } = run({ "A.md": pub(long) });
    expect(note("a").description.endsWith(".")).toBe(true);
    expect(note("a").description).not.toContain("…");
  });

  it("no se queda en una abreviatura al principio", () => {
    const text = `TPR S.A. ${"es la concesionaria de la terminal de contenedores del puerto de Rosario ".repeat(4)}fin.`;
    const { note } = run({ "A.md": pub(text) });
    expect(note("a").description.length).toBeGreaterThan(80);
  });

  it("no parte la frase en números con punto", () => {
    const text = "Mercados de carbono voluntarios y de cumplimiento, estándares Verra, Artículo 6 del Acuerdo de París, Ley 27.520.";
    const { note } = run({ "A.md": pub(text) });
    expect(note("a").description).toBe(text);
  });
});
