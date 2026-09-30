import { Folder } from "~/components/icons";
import { NoteList } from "~/components/NoteList";
import { getManifest } from "~/lib/content.server";
import { site } from "~/site";
import type { Route } from "./+types/notas";

export async function loader() {
  const manifest = getManifest();
  const groups = new Map<string, typeof manifest>();
  for (const note of manifest) {
    const key = note.folder || "Otras notas";
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  return {
    total: manifest.length,
    groups: [...groups]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([folder, notes]) => ({
        folder,
        notes: notes
          .map(({ slug, title, description }) => ({ slug, title, description }))
          .sort((a, b) => a.title.localeCompare(b.title, "es")),
      })),
  };
}

export function meta() {
  return [
    { title: `Notas · ${site.name}` },
    { name: "description", content: "Todas las notas publicadas, ordenadas por tema." },
  ];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function NotasPage({ loaderData }: Route.ComponentProps) {
  const { total, groups } = loaderData;
  return (
    <div className="relative">
      <div className="relative mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="eyebrow reveal" style={i(0)}>
          Biblioteca
        </p>
        <h1 className="reveal mt-2 text-4xl font-semibold sm:text-5xl" style={i(1)}>
          Notas
        </h1>
        <p className="reveal mt-4 text-lg text-muted" style={i(2)}>
          {total} notas publicadas, ordenadas por tema.
        </p>

        {groups.length > 1 && (
          <nav aria-label="Saltar a un tema" className="reveal sticky top-16 z-10 -mx-4 mt-8 bg-bg/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6" style={i(3)}>
            <ul className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <li key={g.folder}>
                  <a
                    href={`#${encodeURIComponent(g.folder)}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 transition-colors hover:border-amber"
                  >
                    {g.folder}
                    <span className="rounded-sm bg-surface-2 px-2 text-sm tabular-nums text-muted">{g.notes.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {groups.map((g) => (
          <section key={g.folder} aria-labelledby={`h-${g.folder}`} className="mt-12 scroll-mt-36" id={g.folder}>
            <h2 id={`h-${g.folder}`} className="flex items-center gap-3 text-2xl font-semibold">
              <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-link">
                <Folder />
              </span>
              {g.folder}
            </h2>
            <NoteList notes={g.notes} columns={2} />
          </section>
        ))}

        {total === 0 && (
          <p className="mt-8">
            Todavía no hay notas publicadas. Para publicar una, agregá <code>publish: true</code> en su
            frontmatter.
          </p>
        )}
      </div>
    </div>
  );
}
