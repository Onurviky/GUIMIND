/**
 * Ilustración del inicio: una red de nodos (el grafo de conocimiento) por la
 * que viajan pulsos de energía. Es decorativa: aria-hidden, sin interacción,
 * y la animación termina sola en menos de 5 segundos.
 */
const NODES: [number, number, number][] = [
  // x, y, radio
  [240, 200, 22],
  [110, 90, 12],
  [380, 70, 14],
  [420, 230, 11],
  [330, 340, 13],
  [150, 320, 12],
  [60, 210, 9],
  [250, 50, 8],
  [460, 360, 8],
  [40, 360, 7],
];

const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [0, 5],
  [1, 6],
  [1, 7],
  [2, 7],
  [2, 3],
  [3, 8],
  [4, 8],
  [5, 9],
  [5, 6],
  [4, 5],
];

export function EnergyGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 420" className={className} aria-hidden="true" focusable="false">
      <g strokeWidth={2} fill="none" strokeLinecap="round">
        {EDGES.map(([a, b], i) => {
          const [x1, y1] = NODES[a]!;
          const [x2, y2] = NODES[b]!;
          const d = `M${x1} ${y1}L${x2} ${y2}`;
          return (
            <g key={i}>
              <path d={d} className="eg-line" />
              {/* Los pulsos salen del nodo central hacia afuera, escalonados. */}
              <path
                d={d}
                pathLength={100}
                className="eg-pulse"
                strokeWidth={3}
                style={{ "--d": 500 + i * 140 } as React.CSSProperties}
              />
            </g>
          );
        })}
      </g>
      {NODES.map(([x, y, r], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={r}
          strokeWidth={2}
          className={i === 0 ? "eg-node eg-core" : "eg-node"}
          style={{ "--d": i * 60 } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
