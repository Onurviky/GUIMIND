# GuiMind

Sitio que publica un vault de Obsidian sobre el sector energético, con herramientas interactivas.

**Stack:** React 19 · React Router 7 (prerender estático) · Vite · TypeScript estricto · Tailwind 4 · Vitest.

## Setup

```bash
npm install
npm run dev        # procesa el vault y levanta http://localhost:5173
                   # (al editar algo en content/ se reprocesa y el navegador se recarga solo)
npm test           # tests del parser
npm run build      # build estático en build/client
```

Requiere Node 20.19 o superior (en Vercel se usa Node 22).

## El vault

- El vault va en `content/`. Para usar otra carpeta: `VAULT_DIR=/ruta/al/vault npm run build`.
- **Hoy `content/` tiene un vault de ejemplo.** Para usar el real, reemplazá la carpeta completa.
- `.obsidian/`, `.trash/` y los archivos ocultos se ignoran.

### Cómo publicar una nota

Solo se publican las notas con esto en el frontmatter:

```yaml
---
publish: true
---
```

Por defecto nada es público. `publish: "true"` (texto) **no** publica y se reporta en el build.

Campos opcionales: `title`, `aliases`, `tags`, `description` (para buscadores) y `updated` (fecha `AAAA-MM-DD`). Si una nota no tiene fecha, no se muestra ninguna: no se inventan fechas.

### Sintaxis soportada

| Obsidian | En la web |
|---|---|
| `[[Nota]]`, `[[Nota\|alias]]`, `[[Nota#Sección]]`, `[[Nota#^bloque]]` | Link interno |
| `![[Nota]]`, `![[Nota#Sección]]`, `![[Nota#^bloque]]` | Contenido embebido, con link a la fuente |
| `![[imagen.png\|300]]` | Imagen (solo se copian las que usan notas publicadas) |
| `#tag`, `#tag/anidado`, `tags:` en el frontmatter | Link a la página del tema |
| `> [!tipo] Título`, `> [!tipo]-` (plegable) | Callout |
| `==resaltado==`, `$fórmulas$`, notas al pie, tablas | Se renderizan |
| `%% comentarios %%`, `<!-- -->` | **Se eliminan** (nunca llegan al HTML) |
| Bloques Dataview | Se ocultan y se reportan |

### Privacidad

- Un link a una nota no publicada se muestra como texto plano, sin URL.
- Un embed de una nota no publicada se omite.
- Las notas privadas no aparecen en listados, tags ni backlinks.

### Reporte del build

Cada build lista en consola los links rotos, ambiguos y a notas privadas, además de los archivos faltantes, las URLs duplicadas y los errores de frontmatter. **El build nunca falla por problemas de contenido.**

## Navegación, búsqueda y grafo

- **Búsqueda:** `Ctrl/⌘ + K` o `/`. Busca sin tildes ni mayúsculas en títulos, alias, temas, encabezados y texto, y tolera errores de tipeo en palabras largas. El índice (MiniSearch) se arma en el build y se descarga recién al abrir el buscador.
- **Grafo (`/grafo`):** el layout se calcula en el build (d3-force, determinístico), así que se prerenderiza y funciona sin JavaScript. Tiene filtros por carpeta y tema (se guardan en la URL), zoom con botones o `Ctrl + rueda` y una vista alternativa en tabla.
- **Colores del grafo:** solo las 3 carpetas con más notas llevan color. Es el máximo que pasa la validación de daltonismo con todos los pares mezclados, en ambos temas. El resto va en gris.

## Estructura

```
content/               vault de Obsidian
scripts/build-content  vault → generated/*.json + public/vault/
src/lib/obsidian/      parser (funciones puras, testeadas)
src/lib/graph.ts       layout del grafo (build)
src/lib/search.ts      opciones del índice (compartidas build/navegador)
app/                   sitio React Router (rutas, componentes, estilos)
tests/                 Vitest
```
