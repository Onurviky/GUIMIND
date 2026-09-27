import { useNavigate } from "react-router";

/**
 * Renderiza el HTML generado en build. Los links internos navegan del lado
 * del cliente (sin recargar) pero siguen siendo <a href> reales: funcionan
 * sin JavaScript, con Ctrl+clic y con el teclado.
 */
export function NoteHtml({ html, className }: { html: string; className?: string }) {
  const navigate = useNavigate();

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest("a");
    if (!a || a.hasAttribute("download") || a.target) return;
    const href = a.getAttribute("href");
    if (!href?.startsWith("/") || href.startsWith("//") || href.startsWith("/vault/")) return;
    e.preventDefault();
    navigate(href, { viewTransition: true });
  }

  return (
    // El div solo delega clics de los <a> que contiene; no es interactivo en sí.
    <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
