/** "2026-09-27" → "27 de septiembre de 2026". Se fija la zona UTC para no correr el día. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));
}
