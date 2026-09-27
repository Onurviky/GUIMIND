import { data, Link } from "react-router";
import { tagUrl } from "@content/obsidian/slug";
import { NoteList } from "~/components/NoteList";
import { getManifest } from "~/lib/content.server";
import { site } from "~/site";
import type { Route } from "./+types/tag";

export async function loader({ params }: Route.LoaderArgs) {
  const path = `/tags/${params["*"] ?? ""}`;
  const manifest = getManifest();
  const tag = manifest.flatMap((n) => n.tags).find((t) => tagUrl(t) === path);
  if (!tag) throw data(null, { status: 404 });
  // Incluye subtags: #solar muestra también las notas con #solar/termica.
  const notes = manifest
    .filter((n) => n.tags.some((t) => t === tag || t.startsWith(`${tag}/`)))
    .map(({ slug, title, description }) => ({ slug, title, description }))
    .sort((a, b) => a.title.localeCompare(b.title, "es"));
  return { tag, notes };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: `Tema no encontrado · ${site.name}` }];
  return [
    { title: `#${data.tag} · ${site.name}` },
    { name: "description", content: `Notas sobre ${data.tag}.` },
  ];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function TagPage({ loaderData }: Route.ComponentProps) {
  const { tag, notes } = loaderData;
  return (
    <div className="relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
      <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="reveal text-base" style={i(0)}>
          <Link to="/notas" viewTransition className="inline-flex min-h-11 items-center">
            Todas las notas
          </Link>
        </p>
        <h1 className="reveal mt-3 text-4xl font-bold sm:text-5xl" style={i(1)}>
          <span className="text-amber-text">#</span>
          {tag}
        </h1>
        <p className="reveal mt-4 text-lg text-muted" style={i(2)}>
          {notes.length === 1 ? "1 nota" : `${notes.length} notas`} con este tema.
        </p>
        <NoteList notes={notes} columns={2} />
      </div>
    </div>
  );
}
