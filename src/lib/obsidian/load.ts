import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { VaultFile } from "./types";

/** Carpetas que Obsidian usa internamente o que nunca se publican. */
const IGNORED_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);

/**
 * Lee el vault del disco. Los .md traen contenido; los demás archivos solo la ruta.
 *
 * `include` limita qué se lee (rutas relativas al vault). Una carpeta incluida
 * se "monta" en la raíz: `02-wiki/casos/X.md` queda como `casos/X.md`. Un
 * archivo incluido conserva su nombre. Sin `include` se lee todo el vault.
 */
export async function loadVault(root: string, include?: readonly string[]): Promise<VaultFile[]> {
  const files: VaultFile[] = [];

  async function walk(dir: string, base: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, base);
      } else if (entry.isFile()) {
        await addFile(full, relative(base, full).split(sep).join("/"));
      }
    }
  }

  async function addFile(full: string, path: string) {
    files.push(
      path.toLowerCase().endsWith(".md")
        ? { path, content: await readFile(full, "utf8"), diskPath: full }
        : { path, diskPath: full },
    );
  }

  if (!include?.length) {
    await walk(root, root);
    return files;
  }

  for (const item of include) {
    const full = join(root, item);
    const info = await stat(full).catch(() => null);
    if (!info) {
      console.warn(`[contenido] VAULT_INCLUDE: no existe "${item}" dentro del vault; se ignora`);
    } else if (info.isDirectory()) {
      await walk(full, full);
    } else {
      await addFile(full, item.split(/[\\/]/).pop()!);
    }
  }
  return files;
}
