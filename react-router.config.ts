import type { Config } from "@react-router/dev/config";
import { readFileSync } from "node:fs";
import type { ManifestEntry } from "./src/lib/content-types";
import { tagUrl } from "./src/lib/obsidian/slug";

/**
 * Sitio 100% estático: cada ruta de contenido se prerenderiza en el build.
 * La única parte dinámica (el chat) va como función serverless aparte.
 */
export default {
  ssr: false,
  async prerender() {
    const manifest: ManifestEntry[] = JSON.parse(readFileSync("generated/manifest.json", "utf8"));
    const tags = new Set(manifest.flatMap((n) => n.tags));
    return ["/", "/notas", "/grafo", ...manifest.map((n) => `/notas/${n.slug}`), ...[...tags].map(tagUrl)];
  },
} satisfies Config;
