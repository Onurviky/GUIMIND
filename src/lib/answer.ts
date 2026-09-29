/** Respuestas del chat: sin dependencias, se usa en el navegador. */

/**
 * Parte una respuesta en bloques para mostrarla sin HTML crudo: párrafos,
 * listas y referencias [n]. Las referencias a números inexistentes quedan como texto.
 */
export type AnswerInline = { type: "text"; text: string } | { type: "ref"; n: number };
export type AnswerBlock = { type: "p"; inlines: AnswerInline[] } | { type: "ul"; items: AnswerInline[][] };

export function parseAnswer(answer: string, validRefs: Set<number>): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const chunk of answer.split(/\n{2,}/)) {
    const lines = chunk.split("\n").filter((l) => l.trim());
    if (lines.length === 0) continue;
    const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l));
    if (isList) {
      blocks.push({ type: "ul", items: lines.map((l) => inlines(l.replace(/^\s*[-•*]\s+/, ""), validRefs)) });
    } else {
      // Un párrafo seguido de una lista sin línea en blanco: se separan.
      const firstItem = lines.findIndex((l) => /^\s*[-•*]\s+/.test(l));
      if (firstItem > 0 && lines.slice(firstItem).every((l) => /^\s*[-•*]\s+/.test(l))) {
        blocks.push({ type: "p", inlines: inlines(lines.slice(0, firstItem).join(" "), validRefs) });
        blocks.push({
          type: "ul",
          items: lines.slice(firstItem).map((l) => inlines(l.replace(/^\s*[-•*]\s+/, ""), validRefs)),
        });
      } else {
        blocks.push({ type: "p", inlines: inlines(lines.join(" "), validRefs) });
      }
    }
  }
  return blocks;
}

function inlines(raw: string, validRefs: Set<number>): AnswerInline[] {
  const text = raw.replace(/\*\*/g, ""); // por si el modelo usa negritas igual
  const out: AnswerInline[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (!validRefs.has(n)) continue;
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    out.push({ type: "ref", n });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}
