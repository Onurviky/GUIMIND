import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Estado de un formulario guardado en la URL (?consumo=350&hsp=4,8).
 * Así los datos cargados no se pierden al recargar, al volver atrás ni al
 * compartir el link. Se guarda el texto tal cual se tipeó, aunque sea inválido.
 *
 * - La fuente de verdad es el estado local: cada tecla se refleja al instante.
 *   (Leer los campos desde el router perdía caracteres al tipear rápido,
 *   porque sus actualizaciones de URL son asíncronas.)
 * - La URL se actualiza de forma sincrónica con history.replaceState, sin
 *   navegar ni volver a pedir datos de la ruta.
 * - Hasta hidratar se usan los valores por defecto: la página prerenderizada
 *   no conoce la URL del visitante.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const defaultsRef = useRef(defaults);
  const [values, setValues] = useState<Record<K, string>>(defaults);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = { ...defaultsRef.current };
    for (const key of Object.keys(initial) as K[]) {
      // Ausente → valor por defecto. Presente aunque vacío → lo que dejó el usuario.
      const fromUrl = params.get(key);
      if (fromUrl !== null) initial[key] = fromUrl;
    }
    setValues(initial);
    setHydrated(true);
  }, []);

  const set = useCallback((key: K, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    writeUrl(url);
  }, []);

  const reset = useCallback(() => {
    setValues({ ...defaultsRef.current });
    const url = new URL(window.location.href);
    for (const key of Object.keys(defaultsRef.current)) url.searchParams.delete(key);
    writeUrl(url);
  }, []);

  return { values, set, reset, hydrated };
}

function writeUrl(url: URL) {
  // Se conserva history.state: el router guarda ahí su clave de navegación.
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/**
 * Para rutas con estado en la URL: cambiar solo la query no vuelve a pedir
 * los datos de la ruta (son estáticos del build).
 */
export function skipRevalidationOnSearchChange({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: {
  currentUrl: URL;
  nextUrl: URL;
  defaultShouldRevalidate: boolean;
}) {
  if (currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}
