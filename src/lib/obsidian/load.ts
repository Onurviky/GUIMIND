import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { VaultFile } from "./types";

/** Carpetas que Obsidian usa internamente o que nunca se publican. */
const IGNORED_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

/** Lee el vault del disco. Los .md traen contenido; los demás archivos solo la ruta. */
export async function loadVault(root: string): Promise<VaultFile[]> {
  const files: VaultFile[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        files.push(
          path.toLowerCase().endsWith(".md") ? { path, content: await readFile(full, "utf8") } : { path },
        );
      }
    }
  }

  await walk(root);
  return files;
}
