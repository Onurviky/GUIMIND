import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * En desarrollo: si cambia algo del vault, se reprocesa el contenido y se
 * recarga el navegador. Así se edita en Obsidian y se ve el resultado al instante.
 */
function vaultWatcher(): Plugin {
  const vaultDir = resolve(process.env.VAULT_DIR ?? "content");
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let pending = false;

  return {
    name: "guimind:vault-watcher",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(vaultDir);
      const rebuild = () => {
        if (running) {
          pending = true;
          return;
        }
        running = true;
        const child = spawn("npx", ["tsx", "scripts/build-content.ts"], { stdio: "inherit", shell: true });
        child.on("exit", () => {
          running = false;
          server.ws.send({ type: "full-reload" });
          if (pending) {
            pending = false;
            rebuild();
          }
        });
      };
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(vaultDir)) return;
        clearTimeout(timer);
        timer = setTimeout(rebuild, 250); // agrupa ráfagas de guardado
      };
      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), vaultWatcher()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
      "@content": fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
});
