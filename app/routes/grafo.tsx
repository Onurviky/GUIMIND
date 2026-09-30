import { GraphView } from "~/components/GraphView";
import { getGraph } from "~/lib/content.server";
import { skipRevalidationOnSearchChange } from "~/lib/revalidate";
import { site } from "~/site";
import type { Route } from "./+types/grafo";

export async function loader() {
  return { graph: getGraph() };
}

// Los filtros viven en la URL: cambiarlos no vuelve a pedir el grafo.
export const shouldRevalidate = skipRevalidationOnSearchChange;

export function meta() {
  return [
    { title: `Grafo · ${site.name}` },
    { name: "description", content: "Mapa interactivo de las notas y cómo se conectan entre sí." },
  ];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function GrafoPage({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="eyebrow reveal" style={i(0)}>
        Explorar
      </p>
      <h1 className="reveal mt-2 text-4xl font-semibold sm:text-5xl" style={i(1)}>
        Grafo de notas
      </h1>
      <p className="reveal mt-4 max-w-2xl text-lg text-muted" style={i(2)}>
        Cada punto es una nota y cada línea, un link entre dos notas. Los puntos más grandes son los conceptos
        más conectados.
      </p>
      <div className="reveal mt-8" style={i(3)}>
        <GraphView graph={loaderData.graph} />
      </div>
    </div>
  );
}
