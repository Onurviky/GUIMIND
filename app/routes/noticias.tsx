import { useEffect } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import type { NewsItem } from "@content/news";
import { ExternalLink } from "~/components/icons";
import { getManifest } from "~/lib/content.server";
import { formatDate } from "~/lib/format";
import { addToVault, ensureFresh, newsState, refresh, retrySummary, setStatus } from "~/lib/news.server";
import { site } from "~/site";
import type { Route } from "./+types/noticias";

export async function loader() {
  ensureFresh();
  const state = newsState();
  // La nota agregada se enlaza por su título (el nombre del archivo), si el sitio ya la procesó.
  const bySlugTitle = new Map(getManifest().map((n) => [n.title, n.slug]));
  const noteSlug = (path?: string) => (path ? bySlugTitle.get(path.split("/").pop()!.replace(/\.md$/, "")) ?? null : null);
  return {
    ...state,
    items: state.items.map((i) => ({ ...i, noteSlug: noteSlug(i.notePath) })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") ?? "");
  try {
    if (intent === "buscar") await refresh();
    else if (intent === "agregar") return { ok: true, notePath: await addToVault(id) };
    else if (intent === "descartar") await setStatus(id, "descartada");
    else if (intent === "restaurar") await setStatus(id, "nueva");
    else if (intent === "resumir") await retrySummary(id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo completar la acción." };
  }
}

export function meta() {
  return [
    { title: `Novedades · ${site.name}` },
    { name: "description", content: "Noticias de la semana relacionadas con la wiki, para decidir cuáles se agregan al cerebro." },
  ];
}

type Item = NewsItem & { noteSlug: string | null };

export default function Noticias({ loaderData }: Route.ComponentProps) {
  const { items, lastRun, nextRun, lastError, running, summarizing } = loaderData;
  const pending = items.filter((i) => i.status === "nueva");
  const added = items.filter((i) => i.status === "agregada");
  const discarded = items.filter((i) => i.status === "descartada");
  const search = useFetcher();
  const searching = running || search.state !== "idle";

  // Mientras se busca o se resume en segundo plano, la página se actualiza sola cada pocos segundos.
  const busyInBackground = running || summarizing;
  const revalidator = useRevalidator();
  useEffect(() => {
    if (!busyInBackground) return;
    const t = setInterval(() => revalidator.revalidate(), 5_000);
    return () => clearInterval(t);
  }, [busyInBackground, revalidator]);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-12 sm:px-6 md:pt-16">
      <header>
        <p className="eyebrow reveal" style={{ "--i": 0 } as React.CSSProperties}>
          Novedades
        </p>
        <h1 className="reveal mt-3 text-4xl sm:text-5xl" style={{ "--i": 1 } as React.CSSProperties}>
          Lo que pasó esta semana
        </h1>
        <p className="reveal mt-4 max-w-2xl text-lg text-muted" style={{ "--i": 2 } as React.CSSProperties}>
          Cada semana GuiMind busca noticias sobre los temas de la wiki, las ordena según cuánto se relacionan con tus
          notas y las resume con el modelo local. Vos decidís cuáles entran al cerebro.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
        <p className="text-base text-muted">
          {searching
            ? "Buscando novedades…"
            : lastRun
              ? `Última búsqueda: ${formatDate(lastRun)}${nextRun ? ` · próxima: ${formatDate(nextRun)}` : ""}`
              : "Todavía no se buscaron novedades."}
        </p>
        <search.Form method="post">
          <input type="hidden" name="intent" value="buscar" />
          <button
            type="submit"
            disabled={searching}
            className="min-h-11 rounded-sm border border-border px-4 font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? "Buscando…" : "Buscar novedades ahora"}
          </button>
        </search.Form>
      </div>

      {lastError && (
        <p role="alert" className="mt-6 border-l-2 border-l-[var(--c-warning)] bg-surface-2 p-4 text-base">
          {lastError}
        </p>
      )}

      <section aria-labelledby="revisar" className="mt-12">
        <h2 id="revisar" className="font-sans text-xl font-semibold">
          Para revisar <span className="font-normal text-muted">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-4 text-base text-muted">
            {searching ? "En un momento aparecen acá." : "No hay novedades pendientes. La próxima búsqueda es automática."}
          </p>
        ) : (
          <ul className="mt-4 border-t border-border">
            {pending.map((item) => (
              <PendingRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      {added.length > 0 && (
        <details className="mt-12 border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">
            Agregadas al cerebro <span className="ml-1.5 font-normal text-muted">({added.length})</span>
          </summary>
          <ul className="mt-2">
            {added.map((item) => (
              <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border py-3">
                <span className="text-base">{item.title}</span>
                {item.noteSlug ? (
                  <Link to={`/notas/${item.noteSlug}`} viewTransition className="inline-flex min-h-11 items-center text-base">
                    Ver la nota
                  </Link>
                ) : (
                  <span className="text-sm text-muted">{item.notePath}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {discarded.length > 0 && (
        <details className="mt-6 border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold">
            Descartadas <span className="ml-1.5 font-normal text-muted">({discarded.length})</span>
          </summary>
          <ul className="mt-2">
            {discarded.map((item) => (
              <DiscardedRow key={item.id} item={item} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PendingRow({ item }: { item: Item }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  return (
    <li className="border-b border-border py-6">
      <p className="text-sm text-muted">
        {item.source || "Medio sin identificar"} · <time dateTime={item.published}>{formatDate(item.published)}</time> ·
        búsqueda “{item.topic}”
      </p>
      <h3 className="mt-2 text-lg font-semibold leading-snug">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-ink">
          {item.title}
          <ExternalLink className="ml-1.5 inline size-4 align-[-2px] text-muted" />
          <span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      </h3>
      <Summary item={item} />
      {item.related.length > 0 && (
        <p className="mt-2 text-base text-muted">
          Se relaciona con{" "}
          {item.related.map((r, k) => (
            <span key={r.slug}>
              {k > 0 && (k === item.related.length - 1 ? " y " : ", ")}
              <Link to={`/notas/${r.slug}`} viewTransition>
                {r.title}
              </Link>
            </span>
          ))}
          .
        </p>
      )}
      <fetcher.Form method="post" className="mt-4 flex flex-wrap gap-3">
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" name="intent" value="agregar" disabled={busy} className="min-h-11 rounded-sm border border-ink px-4 font-medium text-ink transition-colors hover:bg-ink hover:text-bg disabled:opacity-50">
          {busy && fetcher.formData?.get("intent") === "agregar" ? "Agregando…" : "Agregar al cerebro"}
        </button>
        <button
          type="submit"
          name="intent"
          value="descartar"
          disabled={busy}
          className="min-h-11 px-3 font-medium text-muted underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
        >
          Descartar
        </button>
      </fetcher.Form>
      {error && (
        <p role="alert" className="mt-3 text-base text-[var(--c-danger)]">
          {error}
        </p>
      )}
    </li>
  );
}

function DiscardedRow({ item }: { item: Item }) {
  const fetcher = useFetcher<typeof action>();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border py-3">
      <span className="text-base text-muted">{item.title}</span>
      <fetcher.Form method="post">
        <input type="hidden" name="id" value={item.id} />
        <button
          type="submit"
          name="intent"
          value="restaurar"
          disabled={fetcher.state !== "idle"}
          className="min-h-11 text-base font-medium text-link underline underline-offset-4 disabled:opacity-50"
        >
          Volver a revisar
        </button>
      </fetcher.Form>
    </li>
  );
}

/** Resumen del modelo local, o en qué estado está. */
function Summary({ item }: { item: Item }) {
  const fetcher = useFetcher<typeof action>();
  const { summary } = item;

  if (summary.state === "listo") {
    return (
      <div className="mt-3 max-w-3xl">
        <p className="text-base leading-relaxed">{summary.text}</p>
        <p className="mt-1 text-sm text-muted">Resumen generado por IA ({summary.model}) a partir de la nota. Verificalo antes de citar.</p>
      </div>
    );
  }
  if (summary.state === "pendiente" || fetcher.state !== "idle") {
    return (
      <p className="mt-3 flex items-center gap-2 text-base text-muted">
        <span className="size-2 animate-pulse rounded-full bg-ink" aria-hidden="true" />
        Leyendo la nota y resumiéndola con el modelo local…
      </p>
    );
  }
  return (
    <div className="mt-3 max-w-3xl">
      {item.snippet && <p className="text-base">{item.snippet}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
        <span>Sin resumen: {summary.reason}</span>
        <fetcher.Form method="post">
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" name="intent" value="resumir" className="min-h-11 font-medium text-link underline underline-offset-4">
            Volver a resumir
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}
