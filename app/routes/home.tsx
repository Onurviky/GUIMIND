import { Link } from "react-router";
import { EnergyGrid } from "~/components/EnergyGrid";
import { ArrowRight, Folder } from "~/components/icons";
import { NoteList } from "~/components/NoteList";
import { getManifest } from "~/lib/content.server";
import { site } from "~/site";
import type { Route } from "./+types/home";

export async function loader() {
  const manifest = getManifest();
  const folders = new Map<string, number>();
  const inbound = new Map<string, number>();
  for (const n of manifest) {
    if (n.folder) folders.set(n.folder, (folders.get(n.folder) ?? 0) + 1);
    for (const target of n.links) inbound.set(target, (inbound.get(target) ?? 0) + 1);
  }
  // "Empezá por acá": las notas más referenciadas son los conceptos base del vault.
  const starters = [...manifest]
    .sort((a, b) => (inbound.get(b.slug) ?? 0) - (inbound.get(a.slug) ?? 0) || a.title.localeCompare(b.title, "es"))
    .slice(0, 4)
    .map(({ slug, title, description }) => ({ slug, title, description }));

  return {
    stats: {
      notas: manifest.length,
      temas: new Set(manifest.flatMap((n) => n.tags)).size,
      conexiones: manifest.reduce((sum, n) => sum + n.links.length, 0),
    },
    folders: [...folders].sort(([a], [b]) => a.localeCompare(b, "es")),
    starters,
  };
}

export function meta() {
  return [{ title: `${site.name}: ${site.tagline}` }, { name: "description", content: site.description }];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

export default function Home({ loaderData }: Route.ComponentProps) {
  const { stats, folders, starters } = loaderData;

  return (
    <>
      {/* ---------- Hero: qué es el sitio y qué podés hacer, en 5 segundos ---------- */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-40 -top-40 size-[36rem] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--glow), transparent 65%)" }}
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-20">
          <div>
            <p className="reveal inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm font-medium text-muted" style={i(0)}>
              <span className="size-2 rounded-full bg-amber" aria-hidden="true" />
              Base de conocimiento abierta
            </p>
            <h1 className="reveal mt-5 text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl" style={i(1)}>
              El sector energético,{" "}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">explicado</span>
                <span
                  className="absolute inset-x-0 bottom-1 -z-0 h-3 rounded-sm bg-amber/45 sm:bottom-2 sm:h-4"
                  aria-hidden="true"
                />
              </span>{" "}
              y conectado.
            </h1>
            <p className="reveal mt-6 max-w-xl text-lg text-muted sm:text-xl" style={i(2)}>
              {site.description}
            </p>
            <div className="reveal mt-9 flex flex-wrap items-center gap-x-6 gap-y-4" style={i(3)}>
              <Link to="/notas" viewTransition className="btn-primary">
                Explorar las notas
                <ArrowRight />
              </Link>
            </div>

            <dl className="reveal mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6" style={i(4)}>
              {(
                [
                  ["notas", stats.notas],
                  ["temas", stats.temas],
                  ["conexiones", stats.conexiones],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Decorativa: en pantallas chicas se omite para que el contenido suba. */}
          <div className="reveal relative mx-auto hidden w-full max-w-md sm:block md:max-w-none" style={i(2)}>
            <EnergyGrid className="w-full drop-shadow-sm" />
          </div>
        </div>
      </section>

      {/* ---------- Empezá por acá ---------- */}
      {starters.length > 0 && (
        <section aria-labelledby="empezar" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-amber-text">Empezá por acá</p>
              <h2 id="empezar" className="mt-2 text-3xl font-bold">
                Los conceptos más conectados
              </h2>
            </div>
            <Link to="/notas" viewTransition className="inline-flex min-h-11 items-center font-medium">
              Ver todas las notas
            </Link>
          </div>
          <NoteList notes={starters} columns={2} />
        </section>
      )}

      {/* ---------- Temas ---------- */}
      {folders.length > 0 && (
        <section aria-labelledby="temas" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-text">Por tema</p>
          <h2 id="temas" className="mt-2 text-3xl font-bold">
            Recorré el conocimiento por áreas
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {folders.map(([folder, count], n) => (
              <li key={folder} className="card reveal group relative p-5" style={i(n)}>
                <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-link transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <Folder />
                </span>
                <Link
                  to={`/notas#${encodeURIComponent(folder)}`}
                  viewTransition
                  className="mt-4 block text-lg font-semibold after:absolute after:inset-0 after:content-['']"
                >
                  {folder}
                </Link>
                <p className="mt-1 text-base text-muted">{count === 1 ? "1 nota" : `${count} notas`}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
