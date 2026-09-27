const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Elimina los comentarios de Obsidian (%% ... %%) antes de parsear.
 * Es un tema de privacidad: lo que está comentado nunca debe llegar al HTML.
 * Respeta los bloques de código. Igual que en Obsidian, un %% sin cerrar
 * comenta todo lo que sigue.
 */
export function stripComments(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let inComment = false;

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (fence) {
      out.push(line);
      if (line.trim().startsWith(fence)) fence = null;
      continue;
    }
    const fenceMatch = !inComment ? FENCE.exec(line) : null;
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }

    let kept = "";
    let rest = line;
    let touched = inComment;
    while (rest.length > 0) {
      const i = rest.indexOf("%%");
      if (i === -1) {
        if (!inComment) kept += rest;
        break;
      }
      touched = true;
      if (!inComment) kept += rest.slice(0, i);
      inComment = !inComment;
      rest = rest.slice(i + 2);
    }
    // Una línea que era solo comentario desaparece (no deja un párrafo vacío).
    if (touched && kept.trim() === "") continue;
    out.push(kept);
  }
  return out.join("\n");
}
