import { Link } from "react-router";
import { site } from "~/site";

const LINKS = [
  { to: "/notas", label: "Notas" },
  { to: "/grafo", label: "Grafo" },
  { to: "/noticias", label: "Novedades" },
  { to: "/preguntar", label: "Preguntale al cerebro" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-8 text-base text-muted sm:px-6">
        <p>
          <span className="font-medium text-ink">{site.name}</span> · {site.tagline}. Generado desde el vault de
          Obsidian.
        </p>
        <nav aria-label="Pie de página">
          <ul className="flex flex-wrap gap-x-6">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} viewTransition className="inline-flex min-h-11 items-center text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
