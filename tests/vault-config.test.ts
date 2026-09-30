import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseFrontmatter } from "../src/lib/obsidian/frontmatter";
import { loadVault } from "../src/lib/obsidian/load";
import { processVault } from "../src/lib/obsidian/vault";

describe("convenciones del vault Cerebro Digital IA", () => {
  it("usa `sector` como temas y `actualizado` como fecha", () => {
    const fm = parseFrontmatter("---\ntipo: caso\nsector: [hidrocarburos, logistica-portuaria]\nactualizado: 2026-08-27\n---\nx");
    expect(fm.tags).toEqual(["hidrocarburos", "logistica-portuaria"]);
    expect(fm.updated).toBe("2026-08-27");
  });
});

describe("publishAll", () => {
  const files = [
    { path: "A.md", content: "Ver [[B]]" },
    { path: "B.md", content: "---\ntipo: caso\n---\nSin publish" },
  ];

  it("sin la opción, solo se publica lo marcado", () => {
    expect(processVault(files).notes).toHaveLength(0);
  });

  it("con la opción, se publica todo y los links funcionan", () => {
    const { notes, issues } = processVault(files, { publishAll: true });
    expect(notes.map((n) => n.slug).sort()).toEqual(["a", "b"]);
    expect(notes.find((n) => n.slug === "b")!.backlinks).toEqual(["a"]);
    expect(issues).toEqual([]);
  });
});

describe("loadVault con include", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "guimind-"));
    await mkdir(join(dir, "02-wiki", "casos"), { recursive: true });
    await mkdir(join(dir, "privado"), { recursive: true });
    await writeFile(join(dir, "02-wiki", "casos", "Caso.md"), "caso");
    await writeFile(join(dir, "index.md"), "índice");
    await writeFile(join(dir, "privado", "Secreto.md"), "no");
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("monta las carpetas incluidas en la raíz y no lee el resto", async () => {
    const files = await loadVault(dir, ["02-wiki", "index.md"]);
    expect(files.map((f) => f.path).sort()).toEqual(["casos/Caso.md", "index.md"]);
    expect(files.every((f) => f.diskPath)).toBe(true);
  });

  it("sin include lee todo", async () => {
    const files = await loadVault(dir);
    expect(files.map((f) => f.path).sort()).toEqual(["02-wiki/casos/Caso.md", "index.md", "privado/Secreto.md"]);
  });
});
