import { useState } from "react";
import { Link } from "react-router";
import type { ToolMeta } from "@src/calc/catalog";
import { formatDate } from "~/lib/format";
import { ConfirmDialog } from "./ConfirmDialog";

type NoteRefs = { title: string; slug: string }[];

const i = (n: number) => ({ "--i": n }) as React.CSSProperties;

/** Estructura común de toda calculadora: encabezado + formulario | resultado. */
export function ToolShell({
  tool,
  form,
  result,
}: {
  tool: ToolMeta;
  form: React.ReactNode;
  result: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-72" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="reveal text-base" style={i(0)}>
          <Link to="/herramientas" viewTransition className="inline-flex min-h-11 items-center">
            Herramientas
          </Link>
        </p>
        <h1 className="reveal mt-2 text-4xl font-bold sm:text-5xl" style={i(1)}>
          {tool.title}
        </h1>
        <p className="reveal mt-4 max-w-2xl text-lg text-muted" style={i(2)}>
          {tool.summary}
        </p>
        <div className="reveal mt-10 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" style={i(3)}>
          {form}
          <section aria-labelledby="resultado-title" className="flex flex-col gap-6 lg:sticky lg:top-24">
            {result}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Tarjeta del formulario con el botón de borrar (con confirmación). */
export function FormCard({ children, onReset }: { children: React.ReactNode; onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <form
      className="flex flex-col gap-7 rounded-2xl border border-border bg-surface p-5 sm:p-7"
      onSubmit={(e) => e.preventDefault()}
      noValidate
      aria-labelledby="datos-title"
    >
      <h2 id="datos-title" className="text-xl font-bold">
        Tus datos
      </h2>
      {children}
      <div className="border-t border-border pt-5">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="min-h-11 rounded-full px-1 font-medium text-muted underline underline-offset-4 hover:text-ink"
        >
          Borrar los datos cargados
        </button>
        <p className="mt-1 text-sm text-muted">
          Tus datos quedan guardados en la dirección de esta página: podés recargarla o compartir el link.
        </p>
      </div>
      <ConfirmDialog
        open={confirm}
        title="¿Borrar los datos cargados?"
        description="Se vacían todos los campos de esta calculadora. No se puede deshacer."
        confirmLabel="Borrar datos"
        cancelLabel="Mantener datos"
        onConfirm={() => {
          onReset();
          setConfirm(false);
        }}
        onCancel={() => setConfirm(false)}
      />
    </form>
  );
}

/** Sección desplegable para lo que no es imprescindible. */
export function AdvancedOptions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl border border-border bg-bg">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 font-semibold">
        Opciones avanzadas
        <span className="text-sm font-medium text-link underline underline-offset-4">{open ? "Ocultar" : "Mostrar"}</span>
      </summary>
      <div className="flex flex-col gap-7 border-t border-border p-4">{children}</div>
    </details>
  );
}

/** Tarjeta del resultado; si todavía no se puede calcular, dice qué falta. */
export function ResultCard({
  children,
  missing,
  hasErrors,
}: {
  children: React.ReactNode | null;
  missing: string[];
  hasErrors: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7" aria-live="polite">
      <h2 id="resultado-title" className="text-xl font-bold">
        Resultado
      </h2>
      {children ?? (
        <div className="mt-3 text-base">
          {missing.length > 0 ? (
            <>
              <p className="text-muted">Para calcular, completá:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          ) : (
            hasErrors && <p className="text-muted">Corregí los datos marcados en rojo para ver el resultado.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ChartCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">{children}</div>;
}

/** Fórmula, supuestos, conceptos del vault y fecha de revisión del modelo. */
export function Assumptions({
  tool,
  formula,
  notes,
  children,
}: {
  tool: ToolMeta;
  formula: string;
  notes: NoteRefs;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/60 p-5 sm:p-7">
      <h2 className="text-lg font-bold">Supuestos y fórmula</h2>
      <p className="mt-3 rounded-xl bg-surface px-4 py-3 font-mono text-base">{formula}</p>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-base">{children}</ul>
      {notes.length > 0 && (
        <>
          <h3 className="mt-6 font-bold">Conceptos que usa este cálculo</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {notes.map((n) => (
              <li key={n.slug}>
                <Link
                  to={`/notas/${n.slug}`}
                  viewTransition
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3.5 text-base"
                >
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        Modelo de cálculo revisado el <time dateTime={tool.revisado}>{formatDate(tool.revisado)}</time>.
      </p>
    </div>
  );
}

/**
 * Link a una nota del vault si está publicada. Si no lo está: dentro de una
 * frase queda el texto sin link (inline); como ayuda suelta, no se muestra.
 */
export function NoteLink({
  notes,
  title,
  label,
  inline = false,
}: {
  notes: NoteRefs;
  title: string;
  label: string;
  inline?: boolean;
}) {
  const note = notes.find((n) => n.title === title);
  if (!note) return inline ? <>{label}</> : null;
  return (
    <Link to={`/notas/${note.slug}`} viewTransition>
      {label}
    </Link>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/** Número principal del resultado. */
export function Headline({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <>
      <p className="text-sm font-semibold uppercase tracking-widest text-amber-text">{label}</p>
      <p className="mt-1 text-5xl font-bold tabular-nums">
        {value} <span className="text-2xl font-semibold text-muted">{unit}</span>
      </p>
    </>
  );
}
