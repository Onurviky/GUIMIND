import { Link } from "react-router";
import type { NoteRef } from "@content/content-types";
import { ArrowRight } from "./icons";

/**
 * Lista de notas como tarjetas. Toda la tarjeta es clicable (el link se
 * estira con un ::after), pero el título sigue siendo un link subrayado.
 * La descripción se muestra completa, sin truncar.
 */
export function NoteList({ notes, columns = 1 }: { notes: NoteRef[]; columns?: 1 | 2 }) {
  return (
    <ul className={`mt-4 grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
      {notes.map((n, i) => (
        <li
          key={n.slug}
          className="card reveal group relative p-5"
          style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
        >
          <Link
            to={`/notas/${n.slug}`}
            viewTransition
            className="text-lg font-semibold after:absolute after:inset-0 after:rounded-[14px] after:content-['']"
          >
            {n.title}
          </Link>
          {n.description && <p className="mt-1.5 text-base text-muted">{n.description}</p>}
          <ArrowRight className="absolute right-5 top-5 size-5 text-muted opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100" />
        </li>
      ))}
    </ul>
  );
}
