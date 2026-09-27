import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { site } from "~/site";
import { Close, LogoMark, Menu, Search } from "./icons";
import { SearchDialog, useSearchShortcut, type SearchDialogHandle } from "./SearchDialog";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Navegación principal: máximo 5-6 ítems. Solo se listan secciones que existen;
 * "Preguntale al cerebro" se suma en la Fase 4.
 */
const NAV = [
  { to: "/notas", label: "Notas" },
  { to: "/herramientas", label: "Herramientas" },
  { to: "/grafo", label: "Grafo" },
] as const;

export function SiteHeader() {
  const search = useRef<SearchDialogHandle>(null);
  const openSearch = useCallback(() => search.current?.open(), []);
  useSearchShortcut(openSearch);

  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  // Al navegar, el menú mobile se cierra.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Atajo según el sistema; hasta hidratar se muestra "Ctrl K".
  const [shortcut, setShortcut] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘ K");
  }, []);

  return (
    <header className="site-header sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          to="/"
          viewTransition
          className="group flex min-h-11 items-center gap-2.5 text-ink no-underline hover:text-ink"
          aria-label={`${site.name}, ir al inicio`}
        >
          <LogoMark className="size-8 transition-transform duration-300 ease-out group-hover:-rotate-12" />
          <span className="text-lg font-bold tracking-tight">{site.name}</span>
        </Link>

        {/* Desktop: navegación horizontal visible. */}
        <nav aria-label="Principal" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} viewTransition className={desktopLinkClass}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            className="group flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3 text-muted transition-colors hover:border-link hover:text-ink md:pr-2"
            aria-keyshortcuts="Control+K Meta+K /"
          >
            <Search className="size-5" />
            <span className="sr-only md:not-sr-only">Buscar</span>
            <kbd className="ml-3 hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-xs md:inline">
              {shortcut}
            </kbd>
          </button>
          <ThemeToggle />
          {/* Mobile: menú hamburguesa (solo en pantallas chicas). */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className="grid size-11 place-items-center rounded-full border border-border bg-surface text-ink md:hidden"
          >
            {menuOpen ? <Close /> : <Menu />}
          </button>
        </div>
      </div>

      <nav
        id="mobile-menu"
        aria-label="Principal"
        hidden={!menuOpen}
        data-open={menuOpen}
        className="mobile-menu border-t border-border bg-bg md:hidden"
      >
        <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                viewTransition
                className={({ isActive }) =>
                  `flex min-h-12 items-center rounded-lg px-3 text-lg font-medium no-underline ${
                    isActive ? "bg-surface-2 text-ink" : "text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <SearchDialog ref={search} />
    </header>
  );
}

function desktopLinkClass({ isActive }: { isActive: boolean }) {
  return `relative flex min-h-11 items-center px-3 font-medium no-underline after:absolute after:inset-x-3 after:bottom-2 after:h-0.5 after:origin-left after:rounded-full after:bg-amber after:transition-transform after:duration-200 hover:text-ink hover:after:scale-x-100 ${
    isActive ? "text-ink after:scale-x-100" : "text-muted after:scale-x-0"
  }`;
}
