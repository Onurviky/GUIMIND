import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { SearchResultFields } from "@content/search";
import { useSearchIndex } from "~/hooks/useSearchIndex";
import { Close, Search } from "./icons";

export interface SearchDialogHandle {
  open: () => void;
}

const MAX_RESULTS = 20;

/**
 * Buscador en un <dialog> nativo: atrapa el foco, cierra con Escape y
 * devuelve el foco al botón que lo abrió. Los resultados son links reales.
 * La consulta se conserva al cerrar y volver a abrir.
 */
export const SearchDialog = forwardRef<SearchDialogHandle>(function SearchDialog(_props, ref) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const { status, load, index } = useSearchIndex();

  useImperativeHandle(ref, () => ({
    open() {
      const d = dialogRef.current;
      if (!d || d.open) return;
      d.showModal();
      inputRef.current?.select();
      void load();
    },
  }));

  const results = useMemo(() => {
    const q = query.trim();
    if (status !== "ready" || !index.current || q.length < 2) return [];
    return index.current.search(q).slice(0, MAX_RESULTS) as unknown as (SearchResultFields & { id: string })[];
  }, [query, status, index]);

  function close() {
    dialogRef.current?.close();
  }

  // Cierra al hacer clic en el fondo (fuera del panel).
  function onDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) close();
  }

  // Flechas: del campo al primer resultado y entre resultados.
  function onKeyDown(e: React.KeyboardEvent) {
    // Escape cierra siempre. Sin esto, el <input type="search"> usa el primer
    // Escape para borrar lo escrito: se perdería la consulta.
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = [...(listRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    if (links.length === 0) return;
    e.preventDefault();
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") links[Math.min(current + 1, links.length - 1)]?.focus();
    else if (current <= 0) inputRef.current?.focus();
    else links[current - 1]?.focus();
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    listRef.current?.querySelector<HTMLAnchorElement>("a")?.click();
  }

  const q = query.trim();
  let message: string;
  if (status === "loading" || status === "idle") message = "Cargando el buscador…";
  else if (status === "error") message = "No pudimos cargar el buscador.";
  else if (q.length < 2) message = "Escribí al menos 2 letras. Busca en títulos, temas y el texto de las notas.";
  else if (results.length === 0) message = `No encontramos notas para “${q}”. Revisá la ortografía o probá con otra palabra.`;
  else message = results.length === 1 ? "1 nota encontrada." : `${results.length} notas encontradas.`;

  return (
    <dialog ref={dialogRef} className="search-dialog" aria-labelledby="search-title" onClick={onDialogClick}>
      <div className="flex max-h-[inherit] flex-col" onKeyDown={onKeyDown}>
        <h2 id="search-title" className="sr-only">
          Buscar en las notas
        </h2>
        <form role="search" onSubmit={onSubmit} className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-5 shrink-0 text-muted" />
          <label htmlFor="search-input" className="sr-only">
            Buscar notas
          </label>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar notas, por ejemplo: potencia pico"
            autoComplete="off"
            spellCheck={false}
            className="min-h-14 w-full bg-transparent text-lg text-ink outline-none placeholder:text-muted"
            aria-describedby="search-status"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar búsqueda"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
          >
            <Close />
          </button>
        </form>

        <div className="overflow-y-auto p-2">
          <p id="search-status" role="status" className="px-3 py-2 text-base text-muted">
            {message}
            {status === "error" && (
              <>
                {" "}
                <button type="button" onClick={() => void load()} className="font-semibold text-link underline">
                  Reintentar carga
                </button>
              </>
            )}
          </p>
          {results.length > 0 && (
            <ul ref={listRef} className="flex flex-col gap-1">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    to={`/notas/${r.id}`}
                    viewTransition
                    onClick={close}
                    className="block rounded-xl px-3 py-3 no-underline outline-offset-0 hover:bg-surface-2 focus-visible:bg-surface-2"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-link underline decoration-1 underline-offset-4">{r.title}</span>
                      {r.folder && <span className="text-sm text-muted">{r.folder}</span>}
                    </span>
                    {r.description && <span className="mt-1 block text-base text-muted">{r.description}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="hidden border-t border-border px-4 py-2.5 text-sm text-muted sm:block">
          <kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd> para moverte ·{" "}
          <kbd className="font-sans font-semibold">Enter</kbd> abre el primer resultado ·{" "}
          <kbd className="font-sans font-semibold">Esc</kbd> cierra
        </p>
      </div>
    </dialog>
  );
});

/** Atajos globales: Ctrl/⌘ + K o "/" abren el buscador (salvo si ya estás escribiendo). */
export function useSearchShortcut(open: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
