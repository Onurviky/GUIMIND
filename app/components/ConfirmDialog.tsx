import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  description: string;
  /** Texto del botón que ejecuta la acción: "Borrar datos". */
  confirmLabel: string;
  /** Texto del botón que no hace nada: "Mantener datos". */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación sin ambigüedad: los dos botones dicen qué pasa al tocarlos.
 * El foco empieza en la opción segura.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      safeRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      className="search-dialog p-6"
    >
      <h2 id="confirm-title" className="text-xl font-bold">
        {title}
      </h2>
      <p id="confirm-desc" className="mt-2 text-base text-muted">
        {description}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button
          ref={safeRef}
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-sm border border-border bg-surface px-5 font-semibold text-ink hover:bg-surface-2"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-11 rounded-sm bg-[var(--c-danger)] px-5 font-semibold text-bg hover:opacity-90"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
