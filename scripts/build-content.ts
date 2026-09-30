/**
 * Procesa el vault de Obsidian y genera los datos que consume la app.
 *
 * Configuración: VAULT_DIR, VAULT_INCLUDE y PUBLISH_ALL (ver scripts/vault-config.ts y .env.example).
 *
 * Salida:
 *   generated/notes.json     notas publicadas completas (solo se leen en build)
 *   generated/manifest.json  índice liviano: slug, título, carpeta, tags...
 *   generated/graph.json     grafo con layout precalculado
 *   generated/search-meta.json  nombre del índice de búsqueda (lo importa el cliente)
 *   public/_data/search.<hash>.json  índice MiniSearch (se descarga al abrir la búsqueda)
 *   public/vault/**          solo los archivos que usan las notas publicadas
 *
 * Nunca falla por problemas de contenido: los reporta en consola.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import MiniSearch from "minisearch";
import { dirname, join, resolve } from "node:path";
import { formatReport, processVault } from "../src/lib/obsidian";
import { loadVault } from "../src/lib/obsidian/load";
import type { ManifestEntry } from "../src/lib/content-types";
import { computeGraph } from "../src/lib/graph";
import { searchIndexOptions, type SearchDoc } from "../src/lib/search";
import { vaultConfig } from "./vault-config";

const root = resolve(import.meta.dirname, "..");
const config = vaultConfig(root);
const outDir = join(root, "generated");
const assetsDir = join(root, "public", "vault");
const dataDir = join(root, "public", "_data");

const started = performance.now();
const files = await loadVault(config.dir, config.include);
const { notes, assets, issues } = processVault(files, {
  notesBase: "/notas",
  assetsBase: "/vault",
  publishAll: config.publishAll,
});
const diskPaths = new Map(files.map((f) => [f.path, f.diskPath]));

await rm(outDir, { recursive: true, force: true });
await rm(assetsDir, { recursive: true, force: true });
await rm(dataDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

const manifest: ManifestEntry[] = notes.map((n) => ({
  slug: n.slug,
  title: n.title,
  folder: n.folder,
  tags: n.tags,
  description: n.description,
  updated: n.updated,
  links: n.outLinks,
}));

await writeFile(join(outDir, "notes.json"), JSON.stringify(notes));
await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest));
await writeFile(join(outDir, "graph.json"), JSON.stringify(computeGraph(manifest)));

// Índice de búsqueda. El nombre lleva un hash del contenido: se puede cachear para siempre.
const search = new MiniSearch<SearchDoc>(searchIndexOptions);
search.addAll(
  notes.map((n) => ({
    id: n.slug,
    title: n.title,
    aliases: n.aliases.join(" "),
    tags: n.tags.join(" "),
    headings: n.headings.map((h) => h.text).join(" "),
    text: n.text,
    folder: n.folder,
    description: n.description,
  })),
);
const searchJson = JSON.stringify(search);
const searchFile = `search.${createHash("sha256").update(searchJson).digest("hex").slice(0, 10)}.json`;
await writeFile(join(dataDir, searchFile), searchJson);
await writeFile(join(outDir, "search-meta.json"), JSON.stringify({ url: `/_data/${searchFile}`, bytes: searchJson.length }));

for (const asset of assets) {
  const dest = join(root, "public", ...asset.url.split("/").filter(Boolean));
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(diskPaths.get(asset.source) ?? join(config.dir, asset.source), dest);
}

const total = files.filter((f) => f.path.endsWith(".md")).length;
const ms = Math.round(performance.now() - started);
console.log(
  `\n[contenido] Vault: ${config.dir}${config.include.length ? ` (${config.include.join(", ")})` : ""}\n` +
    `[contenido] ${notes.length} de ${total} notas publicadas, ${assets.length} archivo(s) copiados, ` +
    `índice de búsqueda de ${Math.ceil(searchJson.length / 1024)} KB (${ms} ms)`,
);
console.log(formatReport(issues).replace(/^/gm, "[contenido] "));
console.log("");
