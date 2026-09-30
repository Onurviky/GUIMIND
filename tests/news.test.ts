import { describe, expect, it } from "vitest";
import {
  directUrl,
  extractArticleText,
  feedUrl,
  indexWithNews,
  isRecent,
  logEntry,
  newsKey,
  noteFileName,
  noteMarkdown,
  parseRss,
  sameStory,
  type NewsItem,
} from "../src/lib/news";

const rss = `<?xml version="1.0"?><rss xmlns:News="https://www.bing.com"><channel><title>x</title>
<item><title>YPF anunci&#243; inversiones en Vaca Muerta &amp; GNL</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=https%3a%2f%2fwww.infobae.com%2feconomia%2fnota-ypf%2f&amp;c=1&amp;mkt=es-ar</link><description>La petrolera confirm&#243; el plan &lt;b&gt;2027&lt;/b&gt;.</description><pubDate>Mon, 28 Sep 2026 12:00:00 GMT</pubDate><News:Source>Infobae</News:Source></item>
<item><title>Sin fecha</title><link>https://x.com/a</link><pubDate>no es fecha</pubDate></item>
<item><title>Chevron abrió El Trapial – Editorial RN</title><link>https://www.rionegro.com.ar/nota</link><description></description><pubDate>Sun, 27 Sep 2026 09:30:00 GMT</pubDate><News:Source>Río Negro</News:Source></item>
</channel></rss>`;

const item: NewsItem = {
  id: "a",
  title: "YPF anunció inversiones en Vaca Muerta: ¿qué cambia? / GNL",
  source: "Infobae",
  url: "https://www.infobae.com/economia/nota-ypf/",
  snippet: "La petrolera confirmó el plan 2027.",
  published: "2026-09-28T12:00:00.000Z",
  topic: "YPF",
  sector: "hidrocarburos",
  related: [{ slug: "empresas/ypf", title: "YPF" }],
  score: 10,
  status: "nueva",
  summary: { state: "listo", text: "YPF confirmó inversiones por USD 1.000 millones.", model: "qwen2.5:7b" },
  found: "2026-09-28T13:00:00.000Z",
};

describe("feed de noticias (Bing)", () => {
  it("lee título, medio, link directo, copete y fecha; descarta items sin fecha", () => {
    expect(parseRss(rss)).toEqual([
      {
        title: "YPF anunció inversiones en Vaca Muerta & GNL",
        source: "Infobae",
        url: "https://www.infobae.com/economia/nota-ypf/",
        snippet: "La petrolera confirmó el plan 2027.",
        published: "2026-09-28T12:00:00.000Z",
      },
      {
        title: "Chevron abrió El Trapial",
        source: "Río Negro",
        url: "https://www.rionegro.com.ar/nota",
        snippet: "",
        published: "2026-09-27T09:30:00.000Z",
      },
    ]);
  });

  it("saca el link real de la redirección de Bing y deja igual los demás", () => {
    expect(directUrl("http://www.bing.com/news/apiclick.aspx?url=https%3a%2f%2fa.com%2fb&c=1")).toBe("https://a.com/b");
    expect(directUrl("https://a.com/b")).toBe("https://a.com/b");
    expect(directUrl("no es un link")).toBe("");
  });

  it("arma la búsqueda en español de Argentina", () => {
    const url = feedUrl("puerto de Rosario");
    expect(url).toContain("q=puerto%20de%20Rosario");
    expect(url).toContain("format=rss");
    expect(url).toContain("cc=AR");
  });

  it("filtra por antigüedad", () => {
    const now = Date.parse("2026-09-29T00:00:00Z");
    expect(isRecent({ published: "2026-09-25T00:00:00Z" }, 7, now)).toBe(true);
    expect(isRecent({ published: "2026-09-10T00:00:00Z" }, 7, now)).toBe(false);
  });
});

describe("duplicados", () => {
  it("detecta la misma noticia aunque cambien tildes, mayúsculas o signos", () => {
    expect(newsKey("¡YPF invierte en Añelo!")).toBe(newsKey("YPF invierte en anelo"));
  });

  it("reconoce la misma noticia contada por otro medio", () => {
    expect(
      sameStory(
        "Argentina y EE.UU. firmarán acuerdo por más de u$s 6.000 M para el desarrollo de infraestructura y gas de Vaca Muerta (II)",
        "Argentina y EEUU firmarán acuerdo por más de u$s6.000 millones para el desarrollo de infraestructura y gas de Vaca Muerta",
      ),
    ).toBe(true);
    expect(sameStory("Récord de producción en Vaca Muerta", "Nuevo muelle en el puerto de Rosario")).toBe(false);
  });
});

describe("texto de la nota", () => {
  const p = (t: string) => `<p>${t}</p>`;
  const long = "El puerto de Rosario recibió una inversión para ampliar su muelle y mejorar la operación de contenedores.";

  it("toma los párrafos del artículo y deja afuera menús, scripts y pies de foto", () => {
    const html = `<html><nav><p>${long} MENÚ</p></nav><script>var x = "${long}";</script>
      <article><h1>Título</h1>${p(long)}${p("Foto: archivo")}${p(long + " Segundo párrafo con detalles.")}${p(long + " Tercero.")}${p(long + " Cuarto.")}</article>
      <footer><p>${long} PIE</p></footer></html>`;
    const text = extractArticleText(html);
    expect(text.split("\n")).toHaveLength(4);
    expect(text).not.toContain("MENÚ");
    expect(text).not.toContain("PIE");
    expect(text).not.toContain("Foto: archivo");
    expect(text).not.toContain("var x");
  });

  it("devuelve vacío si no hay un cuerpo razonable (muro de pago, página vacía)", () => {
    expect(extractArticleText(`<article>${p("Suscribite para seguir leyendo esta nota exclusiva.")}</article>`)).toBe("");
  });
});

describe("nota para el vault", () => {
  it("nombre de archivo con fecha y sin caracteres inválidos en Windows", () => {
    expect(noteFileName(item)).toBe("2026-09-28 - YPF anunció inversiones en Vaca Muerta ¿qué cambia GNL.md");
  });

  it("corta los nombres largos entre palabras", () => {
    const long = { ...item, title: "Bolivia junto a Paraguay y Uruguay acuerdan consolidar Hidrovía Paraguay–Paraná como eje para conectividad regional y más" };
    expect(noteFileName(long)).toBe(
      "2026-09-28 - Bolivia junto a Paraguay y Uruguay acuerdan consolidar Hidrovía Paraguay–Paraná como eje para conectividad.md",
    );
  });

  it("usa las convenciones del vault, incluye resumen marcado como IA, copete y vínculos", () => {
    const md = noteMarkdown(item, "2026-09-29");
    expect(md).toMatch(/^---\ntipo: noticia\nsector: \[hidrocarburos\]\nestado: pendiente-verificar\nactualizado: 2026-09-29\nfuentes: 1\n---/);
    expect(md).toContain("## Resumen\nYPF confirmó inversiones por USD 1.000 millones.");
    expect(md).toContain("Resumen generado por IA (qwen2.5:7b)");
    expect(md).toContain("## Copete del medio\nLa petrolera confirmó el plan 2027.");
    expect(md).toContain("- Link: https://www.infobae.com/economia/nota-ypf/");
    expect(md).toContain("- [[YPF]]");
  });

  it("sin resumen, no inventa una sección de resumen", () => {
    const md = noteMarkdown({ ...item, summary: { state: "error", reason: "muro de pago" } }, "2026-09-29");
    expect(md).not.toContain("## Resumen");
  });

  it("la entrada de log.md sigue el formato del vault", () => {
    expect(logEntry(item, "2026-09-29", "02-wiki/noticias/x.md")).toContain("## [2026-09-29] noticia | YPF anunció");
  });
});

describe("index.md", () => {
  it("crea la sección Noticias al final si no existe, sin tocar el resto", () => {
    const out = indexWithNews("# Índice\n\n## Sectores\n- [[Hidrocarburos]]\n", "2026-09-28 - YPF", item);
    expect(out.startsWith("# Índice\n\n## Sectores\n- [[Hidrocarburos]]\n\n## Noticias\n")).toBe(true);
    expect(out).toContain("- [[2026-09-28 - YPF]] — Infobae, 2026-09-28");
  });

  it("agrega arriba de la lista si la sección ya existe, y respeta los saltos de línea de Windows", () => {
    const index = "# Índice\r\n\r\n## Noticias\r\nTexto de la sección.\r\n- [[vieja]] — X, 2026-09-01\r\n\r\n## Otra\r\n";
    const out = indexWithNews(index, "nueva", item);
    expect(out).toBe(
      "# Índice\r\n\r\n## Noticias\r\nTexto de la sección.\r\n- [[nueva]] — Infobae, 2026-09-28\r\n- [[vieja]] — X, 2026-09-01\r\n\r\n## Otra\r\n",
    );
  });
});

describe("exclusiones", () => {
  it("separa la búsqueda de las palabras excluidas (sueltas o entre comillas)", async () => {
    const { splitQuery } = await import("../src/lib/news");
    expect(splitQuery('"puerto de Rosario" -Fuerteventura -"Puerto del Rosario"')).toEqual({
      query: '"puerto de Rosario"',
      exclude: ["Fuerteventura", "Puerto del Rosario"],
    });
    expect(splitQuery("YPF")).toEqual({ query: "YPF", exclude: [] });
  });

  it("descarta noticias que mencionan una palabra excluida en título, copete o medio", async () => {
    const { isExcluded } = await import("../src/lib/news");
    const canarias = { title: "Reabre el mercado municipal", snippet: "", source: "Canarias7" };
    const rosario = { title: "Nuevo muelle en el puerto de Rosario", snippet: "Santa Fe", source: "La Capital" };
    expect(isExcluded(canarias, ["Fuerteventura", "Canarias"])).toBe(true);
    expect(isExcluded(rosario, ["Fuerteventura", "Canarias"])).toBe(false);
  });
});
