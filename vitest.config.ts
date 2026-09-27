import { defineConfig } from "vitest/config";

// Config separada: el plugin de React Router no debe cargarse en los tests.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
