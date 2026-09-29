import type { Config } from "@react-router/dev/config";
import { readFileSync } from "node:fs";
import type { ManifestEntry } from "./src/lib/content-types";
import { tagUrl } from "./src/lib/obsidian/slug";

/**
 * Las páginas de contenido se prerenderizan en el build. El servidor (local)
 * queda para lo dinámico: el chat "Preguntale al cerebro" (/preguntar y /api/preguntar).
 */
export default {
  ssr: true,
  async prerender() {
    const manifest: ManifestEntry[] = JSON.parse(readFileSync("generated/manifest.json", "utf8"));
    const tags = new Set(manifest.flatMap((n) => n.tags));
    // El inicio y Novedades no se prerenderizan: muestran novedades pendientes.
    return [
      "/notas",
      "/grafo",
      ...manifest.map((n) => `/notas/${n.slug}`),
      ...[...tags].map(tagUrl),
    ];
  },
} satisfies Config;
