/**
 * Para rutas con estado en la URL (ej: filtros del grafo): cambiar solo la
 * query no vuelve a pedir los datos de la ruta (son estáticos del build).
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
