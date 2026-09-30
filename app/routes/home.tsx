import { Link } from "react-router";
import { ArrowRight, ChevronRight } from "~/components/icons";
import { getManifest } from "~/lib/content.server";
import { formatDate } from "~/lib/format";
import { ensureFresh, pendingCount } from "~/lib/news.server";
import { site } from "~/site";
import type { Route } from "./+types/home";

/** Carpeta del vault donde viven las páginas de overview de cada sector. */
const SECTORS_FOLDER = "sectores";

export async function loader() {
  ensureFresh();
  const manifest = getManifest();
  const folders = new Map<string, number>();
  const inbound = new Map<string, number>();
  for (const n of manifest) {
    if (n.folder) folders.set(n.folder, (folders.get(n.folder) ?? 0) + 1);
    for (const target of n.links) inbound.set(target, (inbound.get(target) ?? 0) + 1);
  }
  const refs = (slug: string) => inbound.get(slug) ?? 0;

  // Sectores: las páginas de overview, de la más referenciada a la menos.
  const sectors = manifest
    .filter((n) => n.folder === SECTORS_FOLDER)
    .sort((a, b) => refs(b.slug) - refs(a.slug) || a.title.localeCompare(b.title, "es"))
    .map(({ slug, title, description }) => ({ slug, title, description, refs: refs(slug) }));

  // Tipos de página (carpetas), sin los sectores que ya tienen su propia sección.
  const types = [...folders]
    .filter(([f]) => f !== SECTORS_FOLDER)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "es"));

  const recent = manifest
    .filter((n) => n.updated && n.folder && n.folder !== SECTORS_FOLDER)
    .sort((a, b) => b.updated!.localeCompare(a.updated!) || refs(b.slug) - refs(a.slug))
    .slice(0, 6)
    .map(({ slug, title, description, folder, updated }) => ({ slug, title, description, folder, updated: updated! }));

  return {
    stats: [
      { value: manifest.length, label: "páginas en la wiki" },
      ...types.slice(0, 3).map(([folder, count]) => ({ value: count, label: folder })),
    ],
    conexiones: manifest.reduce((sum, n) => sum + n.links.length, 0),
    novedades: pendingCount(),
    sectors,
    types,
    recent,
  };
}

export function meta() {
  return [{ title: `${site.name}: ${site.tagline}` }, { name: "description", content: site.description }];
}

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Home({ loaderData }: Route.ComponentProps) {
  const { stats, conexiones, sectors, types, recent, novedades } = loaderData;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* ---------- Presentación: qué es y qué se puede hacer ---------- */}
      <section className="pb-20 pt-20 md:pb-28 md:pt-32">
        <p className="eyebrow reveal" style={i(0)}>
          Cerebro digital · Sector energético y portuario
        </p>
        <h1 className="reveal mt-6 max-w-4xl text-4xl sm:text-5xl lg:text-[4.25rem] lg:leading-[1.05]" style={i(1)}>
          Todo lo que sabe la práctica, conectado en un solo lugar.
        </h1>
        <p className="reveal mt-8 max-w-2xl text-lg text-muted sm:text-xl" style={i(2)}>
          {site.description}
        </p>
        <div className="reveal mt-10 flex flex-wrap items-center gap-x-8 gap-y-4" style={i(3)}>
          <Link to="/notas" viewTransition className="btn-primary">
            Explorar la wiki
            <ArrowRight />
          </Link>
          <Link to="/preguntar" viewTransition className="link-chevron text-ink">
            Preguntale al cerebro
            <ChevronRight />
          </Link>
        </div>
        {novedades > 0 && (
          <p className="reveal mt-8 text-base text-muted" style={i(4)}>
            <Link to="/noticias" viewTransition>
              {novedades === 1 ? "Hay 1 novedad de la semana para revisar" : `Hay ${novedades} novedades de la semana para revisar`}
            </Link>
          </p>
        )}
      </section>

      {/* ---------- Cifras ---------- */}
      <section aria-label="La wiki en números" className="border-y border-border">
        <dl className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, n) => (
            <div
              key={s.label}
              className={`flex flex-col-reverse justify-end py-8 ${n % 2 ? "pl-6 lg:pl-8" : "pr-6"} ${n === 2 ? "lg:pl-8" : ""} ${n > 0 ? "lg:border-l lg:border-border" : ""} ${n % 2 ? "border-l border-border" : ""} ${n >= 2 ? "border-t border-border lg:border-t-0" : ""}`}
            >
              <dt className="mt-1 text-sm text-muted first-letter:uppercase">{s.label}</dt>
              <dd className="font-display text-4xl font-medium tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------- Sectores ---------- */}
      {sectors.length > 0 && (
        <section aria-labelledby="sectores" className="pt-24">
          <p className="eyebrow">Sectores</p>
          <h2 id="sectores" className="mt-3 max-w-2xl text-3xl sm:text-4xl">
            Las áreas de trabajo
          </h2>
          <ul className="mt-12 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.map((s) => (
              <li key={s.slug} className="group relative flex flex-col border-t border-border pb-12 pt-6">
                <h3 className="text-xl font-semibold">
                  <Link
                    to={`/notas/${s.slug}`}
                    viewTransition
                    className="text-ink no-underline after:absolute after:inset-0 after:content-[''] group-hover:underline"
                  >
                    {s.title}
                  </Link>
                </h3>
                {s.description && <p className="mt-3 flex-1 text-base text-muted">{s.description}</p>}
                <p className="mt-5 flex items-center gap-2 text-sm text-muted">
                  {s.refs === 1 ? "1 página vinculada" : `${s.refs} páginas vinculadas`}
                  <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Actualizado recientemente ---------- */}
      {recent.length > 0 && (
        <section aria-labelledby="recientes" className="pt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Últimas actualizaciones</p>
              <h2 id="recientes" className="mt-3 text-3xl sm:text-4xl">
                Lo último que se incorporó
              </h2>
            </div>
            <Link to="/notas" viewTransition className="link-chevron">
              Ver todas las páginas
              <ChevronRight />
            </Link>
          </div>
          <ul className="mt-12 border-t border-border">
            {recent.map((n) => (
              <li key={n.slug} className="group relative grid gap-2 border-b border-border py-7 md:grid-cols-[14rem_1fr] md:gap-10">
                <p className="text-sm text-muted">
                  <span className="uppercase tracking-wider">{n.folder}</span>
                  <span aria-hidden="true"> · </span>
                  <time dateTime={n.updated}>{formatDate(n.updated)}</time>
                </p>
                <div>
                  <h3 className="text-lg font-semibold leading-snug">
                    <Link
                      to={`/notas/${n.slug}`}
                      viewTransition
                      className="text-ink no-underline after:absolute after:inset-0 after:content-[''] group-hover:underline"
                    >
                      {n.title}
                    </Link>
                  </h3>
                  {n.description && <p className="mt-2 max-w-3xl text-base text-muted">{n.description}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Por tipo de página ---------- */}
      {types.length > 0 && (
        <section aria-labelledby="tipos" className="pt-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="eyebrow">Por tipo</p>
              <h2 id="tipos" className="mt-3 text-3xl sm:text-4xl">
                Casos, normas, proyectos y actores
              </h2>
              <p className="mt-4 text-base text-muted">
                {conexiones} enlaces cruzados: cada hecho vive en un solo lugar y se referencia desde todo lo que toca.
              </p>
            </div>
            <ul className="border-t border-border">
              {types.map(([folder, count]) => (
                <li key={folder} className="group border-b border-border">
                  <Link
                    to={`/notas#${encodeURIComponent(folder)}`}
                    viewTransition
                    className="flex min-h-14 items-center justify-between gap-4 py-3 text-ink no-underline"
                  >
                    <span className="text-lg group-hover:underline">{capitalize(folder)}</span>
                    <span className="flex items-center gap-3 text-sm text-muted">
                      <span className="tabular-nums">{count === 1 ? "1 página" : `${count} páginas`}</span>
                      <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
