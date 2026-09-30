import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { themeScript } from "./components/ThemeToggle";
import { site } from "./site";
import "./app.css";

export const links: Route.LinksFunction = () => [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // El script de tema agrega data-theme antes de hidratar.
    <html lang={site.locale} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0b0f0e" media="(prefers-color-scheme: dark)" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-dvh flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-amber focus:px-5 focus:py-3 focus:text-on-amber"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound && import.meta.env.DEV) console.error(error);

  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6">
      <title>{notFound ? `Página no encontrada · ${site.name}` : `Error · ${site.name}`}</title>
      <p className="reveal font-semibold text-amber-text" style={{ "--i": 0 } as React.CSSProperties}>
        {notFound ? "Error 404" : "Error"}
      </p>
      <h1 className="reveal mt-2 text-4xl font-bold" style={{ "--i": 1 } as React.CSSProperties}>
        {notFound ? "No encontramos esta página" : "Algo salió mal"}
      </h1>
      <p className="reveal mt-4 text-lg text-muted" style={{ "--i": 2 } as React.CSSProperties}>
        {notFound
          ? "Puede que la nota se haya movido, renombrado o que no sea pública."
          : "Hubo un error al mostrar esta página. Probá recargarla."}
      </p>
      <p className="reveal mt-8" style={{ "--i": 3 } as React.CSSProperties}>
        <Link to="/notas" viewTransition className="btn-primary">
          Ver todas las notas
        </Link>
      </p>
    </div>
  );
}
