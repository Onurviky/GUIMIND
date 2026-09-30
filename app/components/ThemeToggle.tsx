import { useEffect, useState } from "react";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";

/**
 * Script que corre antes de pintar: aplica el tema guardado y evita el
 * parpadeo. Sin preferencia guardada, manda la del sistema.
 */
export const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function currentTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  // null hasta hidratar: el HTML prerenderizado no conoce el tema del visitante.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(currentTheme()), []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Sin almacenamiento (modo privado): el cambio dura solo esta visita.
    }
    setTheme(next);
  }

  const label = theme === "dark" ? "Activar tema claro" : "Activar tema oscuro";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="group grid size-11 place-items-center rounded-sm border border-border bg-surface text-ink transition-colors hover:border-link"
    >
      <span className="transition-transform duration-300 ease-out group-hover:rotate-12">
        {theme === "dark" ? <Sun /> : <Moon />}
      </span>
    </button>
  );
}
