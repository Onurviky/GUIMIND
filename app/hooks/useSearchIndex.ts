import type MiniSearch from "minisearch";
import { useCallback, useRef, useState } from "react";
import searchMeta from "../../generated/search-meta.json";
import { searchIndexOptions, type SearchDoc } from "@content/search";

type Status = "idle" | "loading" | "ready" | "error";

/**
 * Carga el índice de búsqueda la primera vez que se necesita. MiniSearch y el
 * índice no están en el bundle inicial: se descargan al abrir el buscador.
 */
export function useSearchIndex() {
  const [status, setStatus] = useState<Status>("idle");
  const index = useRef<MiniSearch<SearchDoc> | null>(null);

  const load = useCallback(async () => {
    if (index.current) return;
    setStatus("loading");
    try {
      const [{ default: MiniSearchLib }, json] = await Promise.all([
        import("minisearch"),
        fetch(searchMeta.url).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        }),
      ]);
      index.current = MiniSearchLib.loadJSON<SearchDoc>(json, searchIndexOptions);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  return { status, load, index };
}
