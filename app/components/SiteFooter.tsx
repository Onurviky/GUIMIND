import { Link } from "react-router";
import { site } from "~/site";
import { LogoMark } from "./icons";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-[1fr_auto] sm:px-6">
        <div className="max-w-md">
          <p className="flex items-center gap-2 font-bold">
            <LogoMark className="size-6" /> {site.name}
          </p>
          <p className="mt-3 text-base text-muted">
            Contenido educativo sobre el sector energético. Los cálculos son estimaciones y siempre
            muestran sus supuestos.
          </p>
        </div>
        <nav aria-label="Pie de página">
          <ul className="flex flex-col gap-1 text-base">
            <li>
              <Link to="/notas" viewTransition className="inline-flex min-h-11 items-center">
                Todas las notas
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
