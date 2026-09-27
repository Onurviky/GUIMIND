import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("notas", "routes/notas.tsx"),
  route("notas/*", "routes/nota.tsx"),
  route("tags/*", "routes/tag.tsx"),
  route("grafo", "routes/grafo.tsx"),
] satisfies RouteConfig;
