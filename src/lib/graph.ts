import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { ManifestEntry } from "./content-types";

export interface GraphNode {
  id: string;
  title: string;
  description: string;
  folder: string;
  tags: string[];
  degree: number;
  r: number;
  x: number;
  y: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphFolder {
  name: string;
  count: number;
  /**
   * Color categórico (0-2) o null = gris "otras carpetas".
   * Solo 3 colores: es el máximo que pasa la validación de daltonismo
   * con todos los pares mezclados en el espacio, en ambos temas.
   */
  slot: 0 | 1 | 2 | null;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  folders: GraphFolder[];
  width: number;
  height: number;
}

export const MAX_COLOR_SLOTS = 3;

/**
 * Calcula el layout del grafo en el build. Es determinístico (misma entrada,
 * mismas posiciones), así el grafo no "salta" entre builds y se puede
 * prerenderizar como SVG estático que funciona sin JavaScript.
 */
export function computeGraph(manifest: ManifestEntry[]): GraphData {
  const ids = new Set(manifest.map((n) => n.slug));

  // Links no dirigidos y sin duplicados (A→B y B→A cuentan una vez).
  const seen = new Set<string>();
  const links: GraphLink[] = [];
  for (const n of manifest) {
    for (const t of n.links) {
      if (!ids.has(t) || t === n.slug) continue;
      const key = [n.slug, t].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: n.slug, target: t });
    }
  }

  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }

  type SimNode = SimulationNodeDatum & { id: string; r: number };
  const simNodes: SimNode[] = manifest.map((n) => ({
    id: n.slug,
    r: nodeRadius(degree.get(n.slug) ?? 0),
  }));
  const simLinks: SimulationLinkDatum<SimNode>[] = links.map((l) => ({ source: l.source, target: l.target }));

  const sim = forceSimulation(simNodes)
    .randomSource(lcg(42))
    .force(
      "link",
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(120),
    )
    .force("charge", forceManyBody().strength(-600))
    // Radio de colisión generoso: deja lugar para la etiqueta debajo de cada nodo.
    .force("collide", forceCollide<SimNode>().radius((d) => d.r + 44))
    // Atrae a las notas sueltas para que no queden lejísimos.
    .force("x", forceX().strength(0.06))
    .force("y", forceY().strength(0.06))
    .stop();
  sim.tick(400);

  const pad = 60;
  const xs = simNodes.map((n) => n.x ?? 0);
  const ys = simNodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const width = Math.max(...xs, 0) - minX + pad * 2;
  const height = Math.max(...ys, 0) - minY + pad * 2;

  const bySlug = new Map(simNodes.map((n) => [n.id, n]));
  const nodes: GraphNode[] = manifest.map((n) => {
    const s = bySlug.get(n.slug)!;
    return {
      id: n.slug,
      title: n.title,
      description: n.description,
      folder: n.folder,
      tags: n.tags,
      degree: degree.get(n.slug) ?? 0,
      r: s.r,
      x: round((s.x ?? 0) - minX + pad),
      y: round((s.y ?? 0) - minY + pad),
    };
  });

  return { nodes, links, folders: folderSlots(manifest), width: round(width), height: round(height) };
}

/** Las carpetas con más notas reciben color; el orden es estable (cantidad, luego nombre). */
export function folderSlots(manifest: ManifestEntry[]): GraphFolder[] {
  const counts = new Map<string, number>();
  for (const n of manifest) counts.set(n.folder, (counts.get(n.folder) ?? 0) + 1);
  return [...counts]
    .sort(([a, ca], [b, cb]) => cb - ca || a.localeCompare(b, "es"))
    .map(([name, count], i) => ({
      name,
      count,
      slot: i < MAX_COLOR_SLOTS ? (i as 0 | 1 | 2) : null,
    }));
}

export function nodeRadius(degree: number): number {
  return round(6 + Math.sqrt(degree) * 3);
}

/** Generador pseudoaleatorio con semilla: layout reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
