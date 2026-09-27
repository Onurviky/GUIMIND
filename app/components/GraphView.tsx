import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { GraphData, GraphFolder, GraphNode } from "@content/graph";
import { ArrowRight, List, Maximize, Minus, Network, Plus } from "./icons";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"] as const;
const OTHER = "var(--series-other)";
/** Con pocas notas se muestran todas las etiquetas; con muchas, solo las más conectadas. */
const ALL_LABELS_UNDER = 40;
const ZOOM_LABELS_AT = 1.6;

function folderColor(folder: GraphFolder | undefined): string {
  return folder?.slot == null ? OTHER : SERIES[folder.slot];
}

/**
 * Grafo de notas. Las posiciones vienen precalculadas del build, así que el
 * SVG se prerenderiza y funciona sin JavaScript (cada nodo es un link real).
 * Con JS suma: zoom/arrastre, filtros por carpeta y tema, resaltado de
 * vecinos y una vista alternativa en lista.
 */
export function GraphView({ graph }: { graph: GraphData }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Filtros en la URL: sobreviven a recargar y se pueden compartir.
  const hidden = new Set((params.get("ocultar") ?? "").split(",").filter(Boolean));
  const tag = params.get("tema");
  const view = params.get("vista") === "lista" ? "lista" : "grafo";

  function update(mut: (p: URLSearchParams) => void) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mut(next);
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  const toggleFolder = (name: string) =>
    update((p) => {
      const h = new Set(hidden);
      if (h.has(name)) h.delete(name);
      else h.add(name);
      if (h.size) p.set("ocultar", [...h].join(","));
      else p.delete("ocultar");
    });
  const setTag = (t: string) => update((p) => (t ? p.set("tema", t) : p.delete("tema")));
  const setView = (v: "grafo" | "lista") => update((p) => (v === "lista" ? p.set("vista", "lista") : p.delete("vista")));
  const clearFilters = () =>
    update((p) => {
      p.delete("ocultar");
      p.delete("tema");
    });

  const folderByName = useMemo(() => new Map(graph.folders.map((f) => [f.name, f])), [graph.folders]);
  const allTags = useMemo(
    () => [...new Set(graph.nodes.flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b, "es")),
    [graph.nodes],
  );
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of graph.nodes) m.set(n.id, new Set());
    for (const l of graph.links) {
      m.get(l.source)?.add(l.target);
      m.get(l.target)?.add(l.source);
    }
    return m;
  }, [graph]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const matches = (n: GraphNode) =>
    !hidden.has(n.folder) && (!tag || n.tags.some((t) => t === tag || t.startsWith(`${tag}/`)));
  const visibleCount = graph.nodes.filter(matches).length;
  const filtered = hidden.size > 0 || tag != null;

  // Etiquetas: siempre si el grafo es chico; si no, las más conectadas (top 15%).
  const labelMinDegree = useMemo(() => {
    if (graph.nodes.length < ALL_LABELS_UNDER) return 0;
    const degrees = graph.nodes.map((n) => n.degree).sort((a, b) => b - a);
    return Math.max(1, degrees[Math.floor(degrees.length * 0.15)] ?? 1);
  }, [graph.nodes]);

  const [hot, setHot] = useState<string | null>(null);
  const hotNeighbors = hot ? neighbors.get(hot) : undefined;
  const hotNode = hot ? byId.get(hot) : undefined;

  // ------------------------------------------------------------ zoom y arrastre
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoomK = useRef(1);

  // Encuadre: el grafo con 15% de margen, con un mínimo para que un vault
  // chico no se vea con nodos gigantes.
  const vbW = Math.max(graph.width * 1.15, 360);
  const vbH = Math.max(graph.height * 1.15, 300);
  const viewBox = `${(graph.width - vbW) / 2} ${(graph.height - vbH) / 2} ${vbW} ${vbH}`;

  useEffect(() => {
    if (view !== "grafo" || !svgRef.current) return;
    const svg = select(svgRef.current);
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 5])
      // La rueda solo hace zoom con Ctrl/⌘: así el grafo no secuestra el scroll de la página.
      .filter((e: Event) => {
        if (e.type === "wheel") return (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey;
        return !(e as MouseEvent).button;
      })
      .on("zoom", (e) => {
        layerRef.current?.setAttribute("transform", e.transform.toString());
        zoomK.current = e.transform.k;
        updateLabelScale();
        setZoomedIn(e.transform.k >= ZOOM_LABELS_AT);
      });
    svg.call(behavior);
    zoomRef.current = behavior;

    // Las etiquetas mantienen ~13px en pantalla sin importar el ancho ni el zoom.
    const el = svgRef.current;
    function updateLabelScale() {
      const fit = Math.min(el.clientWidth / vbW, el.clientHeight / vbH) || 1;
      el.style.setProperty("--label-scale", String(1 / (fit * zoomK.current)));
    }
    updateLabelScale();
    const ro = new ResizeObserver(updateLabelScale);
    ro.observe(el);
    return () => {
      svg.on(".zoom", null);
      ro.disconnect();
    };
  }, [view, vbW, vbH]);

  const zoomBy = (k: number) => svgRef.current && zoomRef.current?.scaleBy(select(svgRef.current), k);
  const resetZoom = () => svgRef.current && zoomRef.current?.transform(select(svgRef.current), zoomIdentity);

  return (
    <div>
      {/* ---------------------------------------------------------- controles */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <fieldset className="min-w-0">
          <legend className="text-sm font-semibold text-muted">Carpetas: tocá para mostrar u ocultar</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {graph.folders.map((f) => {
              const on = !hidden.has(f.name);
              return (
                <li key={f.name}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleFolder(f.name)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-base transition-colors ${
                      on ? "border-border bg-bg text-ink" : "border-dashed border-border bg-transparent text-muted line-through"
                    }`}
                  >
                    <span
                      className="size-3 rounded-full ring-2 ring-surface"
                      style={{ background: folderColor(f), opacity: on ? 1 : 0.4 }}
                      aria-hidden="true"
                    />
                    {f.name || "Sin carpeta"}
                    <span className="text-sm tabular-nums text-muted">{f.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {graph.folders.some((f) => f.slot == null) && (
            <p className="mt-2 text-sm text-muted">
              Las carpetas en gris comparten color: con más de 3 colores mezclados, algunas personas no los
              distinguen.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="graph-tag" className="text-sm font-semibold text-muted">
              Tema
            </label>
            <select
              id="graph-tag"
              value={tag ?? ""}
              onChange={(e) => setTag(e.target.value)}
              className="min-h-11 rounded-lg border border-border bg-bg px-3 text-base text-ink"
            >
              <option value="">Todos los temas</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex rounded-full border border-border bg-bg p-1" role="group" aria-label="Forma de ver">
            {(
              [
                ["grafo", "Grafo", Network],
                ["lista", "Lista", List],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-base font-medium transition-colors ${
                  view === v ? "bg-ink text-bg" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="size-4" />
                <span className="sm:hidden">{label}</span>
                <span className="hidden sm:inline">Ver como {label.toLowerCase()}</span>
              </button>
            ))}
          </div>

          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 rounded-full px-3 font-medium text-link underline underline-offset-4"
            >
              Quitar filtros
            </button>
          )}
        </div>

        <p role="status" className="basis-full text-base text-muted">
          Mostrando <strong className="text-ink">{visibleCount}</strong> de {graph.nodes.length} notas
          {filtered ? " (hay filtros activos)" : ""}.
        </p>
      </div>

      {/* ---------------------------------------------------------- grafo */}
      {view === "grafo" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
            <a
              href="#despues-del-grafo"
              className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded-full focus:bg-amber focus:px-4 focus:py-2 focus:text-on-amber"
            >
              Saltar el grafo
            </a>
            <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
            <svg
              ref={svgRef}
              viewBox={viewBox}
              className="graph-canvas relative block h-[clamp(420px,65vh,720px)] w-full"
              role="group"
              aria-label={`Grafo de ${graph.nodes.length} notas y ${graph.links.length} conexiones. Cada nodo es un link a la nota.`}
            >
              <g ref={layerRef}>
                <g aria-hidden="true">
                  {graph.links.map((l) => {
                    const a = byId.get(l.source)!;
                    const b = byId.get(l.target)!;
                    const isHot = hot != null && (l.source === hot || l.target === hot);
                    const dim = !matches(a) || !matches(b) || (hot != null && !isHot);
                    return (
                      <line
                        key={`${l.source}|${l.target}`}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        className={`graph-link ${isHot ? "is-hot" : ""} ${dim ? "is-dim" : ""}`}
                      />
                    );
                  })}
                </g>
                {graph.nodes.map((n, i) => {
                  const visible = matches(n);
                  const isHot = n.id === hot || (hotNeighbors?.has(n.id) ?? false);
                  const dim = !visible || (hot != null && !isHot);
                  const showLabel = visible && (n.degree >= labelMinDegree || zoomedIn || isHot);
                  const folder = folderByName.get(n.folder);
                  return (
                    <a
                      key={n.id}
                      href={`/notas/${n.id}`}
                      className={`graph-node ${isHot ? "is-hot" : ""} ${dim ? "is-dim" : ""}`}
                      tabIndex={visible ? 0 : -1}
                      aria-hidden={visible ? undefined : true}
                      aria-label={`${n.title}. ${n.folder || "Sin carpeta"}, ${n.degree} ${n.degree === 1 ? "conexión" : "conexiones"}.`}
                      onMouseEnter={() => setHot(n.id)}
                      onMouseLeave={() => setHot(null)}
                      onFocus={() => setHot(n.id)}
                      onBlur={() => setHot(null)}
                      onClick={(e) => {
                        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        navigate(`/notas/${n.id}`, { viewTransition: true });
                      }}
                    >
                      {/* Área de interacción invisible de 44px o más: más grande que el punto. */}
                      <circle cx={n.x} cy={n.y} r={Math.max(n.r + 10, 22)} className="graph-hit" />
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={folderColor(folder)}
                        style={{ "--d": Math.min(i * 25, 800) } as React.CSSProperties}
                      />
                      {showLabel && (
                        <text x={n.x} y={n.y + n.r} dy="1.1em" textAnchor="middle">
                          {n.title}
                        </text>
                      )}
                    </a>
                  );
                })}
              </g>
            </svg>

            <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <button type="button" onClick={() => zoomBy(1.4)} aria-label="Acercar" title="Acercar" className="grid size-11 place-items-center hover:bg-surface-2">
                <Plus />
              </button>
              <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Alejar" title="Alejar" className="grid size-11 place-items-center border-y border-border hover:bg-surface-2">
                <Minus />
              </button>
              <button type="button" onClick={resetZoom} aria-label="Ver el grafo completo" title="Ver el grafo completo" className="grid size-11 place-items-center hover:bg-surface-2">
                <Maximize />
              </button>
            </div>
          </div>

          {/* Detalle de la nota bajo el mouse o con foco. */}
          <aside className="rounded-2xl border border-border bg-surface p-5" aria-live="polite">
            {hotNode ? (
              <div>
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: folderColor(folderByName.get(hotNode.folder)) }}
                    aria-hidden="true"
                  />
                  {hotNode.folder || "Sin carpeta"}
                </p>
                <p className="mt-2 text-xl font-bold">{hotNode.title}</p>
                <p className="mt-1 text-base text-muted">
                  {hotNode.degree} {hotNode.degree === 1 ? "conexión" : "conexiones"}
                </p>
                {hotNode.description && <p className="mt-3 text-base">{hotNode.description}</p>}
              </div>
            ) : (
              <div className="text-base text-muted">
                <p className="font-semibold text-ink">Cómo usar el grafo</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 pointer-coarse:hidden">
                  <li>Pasá el mouse o navegá con Tab para ver el detalle de cada nota.</li>
                  <li>Hacé clic en un nodo para abrir la nota.</li>
                  <li>Arrastrá para moverte. Para hacer zoom usá los botones o Ctrl + rueda.</li>
                </ul>
                <ul className="mt-2 hidden list-disc space-y-1.5 pl-5 pointer-coarse:block">
                  <li>Tocá un nodo para abrir la nota.</li>
                  <li>Arrastrá con un dedo para moverte y pellizcá para hacer zoom.</li>
                  <li>Si preferís, usá la vista en lista.</li>
                </ul>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <GraphTable nodes={graph.nodes.filter(matches)} folderByName={folderByName} />
      )}
      <div id="despues-del-grafo" tabIndex={-1} />
    </div>
  );
}

/** Vista alternativa accesible: la misma información en una tabla. */
function GraphTable({ nodes, folderByName }: { nodes: GraphNode[]; folderByName: Map<string, GraphFolder> }) {
  const sorted = [...nodes].sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title, "es"));
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full text-left text-base">
        <caption className="sr-only">Notas y cantidad de conexiones, de más a menos conectadas</caption>
        <thead className="border-b border-border text-sm text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Nota</th>
            <th scope="col" className="px-4 py-3 font-semibold">Carpeta</th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">Conexiones</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((n) => (
            <tr key={n.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <Link to={`/notas/${n.id}`} viewTransition className="inline-flex min-h-11 items-center gap-2 font-semibold">
                  {n.title}
                  <ArrowRight className="size-4" />
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: folderColor(folderByName.get(n.folder)) }} aria-hidden="true" />
                  {n.folder || "Sin carpeta"}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{n.degree}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && <p className="p-4 text-muted">Ninguna nota coincide con los filtros.</p>}
    </div>
  );
}
