# GuiMind

Sitio local que publica el vault de Obsidian "Cerebro Digital IA" (derecho energético, portuario y ambiental) y permite hacerle preguntas.

**Stack:** React 19 · React Router 7 (prerender + servidor local) · Vite · TypeScript estricto · Tailwind 4 · Vitest.

## Setup

```bash
npm install
cp .env.example .env   # y completá la ruta del vault y la clave de la API
npm run dev        # procesa el vault y levanta http://localhost:5173
                   # (al editar algo en el vault se reprocesa y el navegador se recarga solo)
npm test           # tests del parser y del chat
npm run build      # build en build/ (npm start lo sirve)
```

Requiere Node 20.19 o superior.

## El vault

- El vault se configura en `.env` (copiá `.env.example`). `VAULT_DIR` es obligatoria.
  - `VAULT_DIR`: carpeta del vault. Se lee directo desde ahí, no se copia.
  - `VAULT_INCLUDE`: qué leer, separado por comas. Una carpeta se monta en la raíz (`02-wiki/casos/X.md` → `casos/X.md`); el resto del vault ni se lee.
  - `PUBLISH_ALL=true`: publica todas las notas leídas sin exigir `publish: true`. **Solo para uso local.**
- Del frontmatter del vault también se usan `sector` (como temas) y `actualizado` (como fecha).
- `.obsidian/`, `.trash/` y los archivos ocultos se ignoran.

### Uso local

Doble clic en **`Iniciar GuiMind.bat`**: instala lo necesario la primera vez, procesa el vault y abre el navegador. Mientras la ventana esté abierta, lo que se guarde en Obsidian aparece en el sitio solo. Para cerrarlo, se cierra la ventana.

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

## Preguntale al cerebro (`/preguntar`)

Chat que responde **solo** con el contenido de la wiki y cita cada dato como [n], con link a la nota.

1. **Recuperación** (`src/lib/ask.ts`): las notas se parten en fragmentos por sección (hasta ~2.400 caracteres) y se buscan los más relevantes para la pregunta (MiniSearch, sin tildes, tolera errores de tipeo).
2. **Generación** (`app/lib/ask.server.ts`): los fragmentos van agrupados por nota y numerados. El modelo tiene que citar y decir cuándo la wiki no cubre la pregunta. La respuesta llega en streaming.
3. **Página** (`app/routes/preguntar.tsx`): citas como links, lista de fuentes, y la conversación sobrevive a recargar la página.

### Motor (`LLM_PROVIDER` en `.env`)

| Motor | Qué necesita | Texto por pregunta |
|---|---|---|
| `ollama` (por defecto) | Ollama abierto y el modelo descargado (`ollama pull qwen2.5:7b`). Gratis; nada sale de la computadora. | ~20.000 caracteres |
| `anthropic` | `ANTHROPIC_API_KEY` en `.env`. Cada pregunta tiene costo. | ~160.000 caracteres |

- Con Ollama, la primera pregunta tarda mientras el modelo se carga en memoria (se empieza a cargar al abrir la página); después responde en segundos. Queda cargado 30 minutos.
- `OLLAMA_MODEL` cambia el modelo local y `OLLAMA_URL` la dirección de Ollama (por defecto `http://localhost:11434`).
- Límite: 8 preguntas por minuto. Si una nota contiene instrucciones, el modelo las trata como material de consulta, no como órdenes.

## Novedades (`/noticias`)

Cada 7 días GuiMind busca noticias sobre los temas de la wiki y el usuario decide cuáles entran al cerebro.

- **Temas:** `noticias.config.json` (búsquedas, sector de cada una, carpeta del vault, días entre búsquedas, máximo de noticias). Admite comillas para frases exactas y `-palabra` para excluir.
- **Fuente:** feed RSS de Bing Noticias (gratis, sin clave; uso personal). Trae el link directo al medio y el copete.
- **Relevancia** (`app/lib/news.server.ts`): cada titular se cruza con la wiki; se descartan los que no se relacionan con ninguna nota y se ordenan por relación. La misma noticia contada por otro medio no se repite.
- **Cuándo busca:** al abrir el inicio o Novedades, si pasaron los días configurados (no hace falta una tarea programada). También con "Buscar novedades ahora".
- **Agregar al cerebro:** crea `02-wiki/noticias/AAAA-MM-DD - Título.md` con las convenciones del vault (`tipo: noticia`, `estado: pendiente-verificar`, fuente y vínculos a las notas relacionadas) (con el resumen, marcado como generado por IA) y suma una entrada en `log.md` y un link en la sección "Noticias" de `index.md`. Nunca pisa una nota existente.
- **Resumen:** después de cada búsqueda, en segundo plano y de a una, GuiMind abre cada nota, extrae su texto y el modelo local escribe un resumen de 3–4 oraciones basado solo en ese texto. Si la nota no se puede leer (muro de pago, el medio no responde) lo dice y muestra el copete; se puede reintentar.
- **Estado** (nuevas, agregadas, descartadas, resúmenes): `data/noticias.json`, fuera de git.

## Estructura

```
scripts/build-content  vault (.env) → generated/*.json + public/vault/
src/lib/obsidian/      parser (funciones puras, testeadas)
src/lib/graph.ts       layout del grafo (build)
src/lib/search.ts      opciones del índice (compartidas build/navegador)
src/lib/ask.ts         recuperación y contexto del chat (puro, testeado)
src/lib/news.ts        feed de noticias y nota para el vault (puro, testeado)
app/                   sitio React Router (rutas, componentes, estilos)
tests/                 Vitest
```
