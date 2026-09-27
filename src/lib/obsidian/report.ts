import type { Issue, IssueKind } from "./types";

const LABELS: Record<IssueKind, string> = {
  "broken-link": "Links rotos",
  "ambiguous-link": "Links ambiguos",
  "private-link": "Links a notas no publicadas (se muestran como texto)",
  "private-embed": "Embeds de notas no publicadas (omitidos)",
  "embed-cycle": "Embeds circulares o muy anidados",
  "missing-asset": "Archivos no encontrados",
  "dataview-removed": "Consultas Dataview ocultas",
  "slug-collision": "URLs duplicadas",
  "publish-not-boolean": "`publish` mal escrito",
  "invalid-frontmatter": "Frontmatter inválido",
};

/** Reporte legible para la consola del build, agrupado por tipo y archivo. */
export function formatReport(issues: Issue[]): string {
  if (issues.length === 0) return "Sin incidencias en el vault.";
  const lines: string[] = [`${issues.length} incidencia(s) en el vault:`];
  for (const kind of Object.keys(LABELS) as IssueKind[]) {
    const ofKind = issues.filter((i) => i.kind === kind);
    if (ofKind.length === 0) continue;
    lines.push("", `▸ ${LABELS[kind]} (${ofKind.length})`);
    for (const issue of ofKind) lines.push(`  ${issue.file}: ${issue.message}`);
  }
  return lines.join("\n");
}
