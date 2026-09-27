import { useEffect, useState } from "react";

/** Id del encabezado que se está leyendo, para resaltarlo en el índice. */
export function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");

  useEffect(() => {
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // El primero visible en orden de documento; si no hay, se mantiene el anterior.
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // `key` resume `ids`: así el efecto no se re-ejecuta en cada render.
  }, [key]);

  return active;
}
