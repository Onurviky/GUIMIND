import { data, Link } from "react-router";
import "katex/dist/katex.min.css";
import { Calendar, Folder, Link2 } from "~/components/icons";
import { NoteHtml } from "~/components/NoteHtml";
import { NoteList } from "~/components/NoteList";
import { TagList } from "~/components/TagList";
import { useActiveHeading } from "~/hooks/useActiveHeading";
import { getNote, getRefs } from "~/lib/content.server";
import { formatDate } from "~/lib/format";
import { site } from "~/site";
import type { Route } from "./+types/nota";

export async function loader({ params }: Route.LoaderArgs) {
  const note = getNote(params["*"] ?? "");
  if (!note) throw data(null, { status: 404 });
  const { text: _text, outLinks: _out, ...rest } = note;
  return { note: rest, backlinks: getRefs(note.backlinks) };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [{ title: `Nota no encontrada · ${site.name}` }];
  return [
    { title: `${data.note.title} · ${site.name}` },
    { name: "description", content: data.note.description },
  ];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function NotaPage({ loaderData }: Route.ComponentProps) {
  const { note, backlinks } = loaderData;
  const toc = note.headings.filter((h) => h.depth === 2 || h.depth === 3);
  const showToc = toc.length >= 2;
  const active = useActiveHeading(showToc ? toc.map((h) => h.id) : []);

  return (
    <>
      <div className="read-progress" aria-hidden="true" />

      <div className="relative">
        <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
          <article className="min-w-0">
            <nav aria-label="Ubicación" className="reveal text-base" style={i(0)}>
              <ol className="flex flex-wrap items-center gap-2 text-muted">
                <li>
                  <Link to="/notas" viewTransition className="inline-flex min-h-11 items-center">
                    Notas
                  </Link>
                </li>
                {note.folder && (
                  <>
                    <li aria-hidden="true">/</li>
                    <li className="inline-flex items-center gap-1.5">
                      <Folder className="size-4" />
                      {note.folder}
                    </li>
                  </>
                )}
              </ol>
            </nav>

            <header className="mt-4 pb-8">
              <h1 className="reveal text-4xl font-bold leading-[1.1] sm:text-5xl" style={i(1)}>
                {note.title}
              </h1>
              {note.aliases.length > 0 && (
                <p className="reveal mt-3 text-lg text-muted" style={i(2)}>
                  También conocido como: {note.aliases.join(", ")}
                </p>
              )}
              <div className="reveal mt-6 flex flex-col gap-4" style={i(3)}>
                {note.updated && (
                  <p className="inline-flex items-center gap-2 text-base text-muted">
                    <Calendar className="size-4" />
                    Actualizada el <time dateTime={note.updated}>{formatDate(note.updated)}</time>
                  </p>
                )}
                <TagList tags={note.tags} />
              </div>
            </header>

            <div className="reveal" style={i(4)}>
              <NoteHtml html={note.html} className="note-body prose max-w-[70ch]" />
            </div>

            <section aria-labelledby="backlinks" className="mt-16 rounded-2xl border border-border bg-surface-2/60 p-6 sm:p-8">
              <h2 id="backlinks" className="flex items-center gap-2 text-xl font-bold">
                <Link2 className="size-5 text-link" />
                Notas que enlazan acá
              </h2>
              {backlinks.length > 0 ? (
                <NoteList notes={backlinks} columns={2} />
              ) : (
                <p className="mt-2 text-muted">Ninguna nota publicada enlaza a esta todavía.</p>
              )}
            </section>
          </article>

          {showToc && (
            <aside className="hidden lg:block">
              <nav aria-labelledby="toc" className="sticky top-24 border-l border-border pl-5">
                <h2 id="toc" className="text-sm font-semibold uppercase tracking-widest text-muted">
                  En esta nota
                </h2>
                <ul className="mt-3 space-y-0.5 text-base">
                  {toc.map((h) => {
                    const isActive = active === h.id;
                    return (
                      <li key={h.id} className={`relative ${h.depth === 3 ? "pl-4" : ""}`}>
                        <span
                          className={`absolute -left-[22px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-amber transition-transform duration-300 ${
                            isActive ? "scale-y-100" : "scale-y-0"
                          }`}
                          aria-hidden="true"
                        />
                        <a
                          href={`#${h.id}`}
                          aria-current={isActive ? "location" : undefined}
                          className={`inline-block py-1.5 transition-colors ${isActive ? "font-semibold text-ink" : ""}`}
                        >
                          {h.text}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
