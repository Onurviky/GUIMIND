import { Link } from "react-router";
import { ArrowRight } from "~/components/icons";
import { site } from "~/site";
import { TOOLS } from "@src/calc/catalog";

export function meta() {
  return [
    { title: `Herramientas · ${site.name}` },
    { name: "description", content: "Calculadoras para estimar tu propio caso, con los supuestos a la vista." },
  ];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function HerramientasPage() {
  return (
    <div className="relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
      <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="reveal text-sm font-semibold uppercase tracking-widest text-amber-text" style={i(0)}>
          Herramientas
        </p>
        <h1 className="reveal mt-2 text-4xl font-bold sm:text-5xl" style={i(1)}>
          Calculá tu caso
        </h1>
        <p className="reveal mt-4 max-w-2xl text-lg text-muted" style={i(2)}>
          Calculadoras gratuitas que usan los conceptos de las notas. Cada resultado muestra la fórmula, los
          supuestos y de dónde sale cada dato. Son estimaciones, no reemplazan un relevamiento técnico.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t, n) => (
            <li key={t.id} className="card reveal group relative p-6" style={i(3 + n)}>
              <Link
                to={`/herramientas/${t.id}`}
                viewTransition
                className="text-xl font-bold after:absolute after:inset-0 after:rounded-[14px] after:content-['']"
              >
                {t.title}
              </Link>
              <p className="mt-2 text-base text-muted">{t.summary}</p>
              <p className="mt-4 inline-flex items-center gap-2 font-semibold text-link">
                Abrir la calculadora
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
