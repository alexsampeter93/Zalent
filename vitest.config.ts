import { defineConfig } from "vitest/config";

// Config de tests separada de vite.config.ts (esa es solo para Tauri dev/build).
// Entorno "node": los módulos bajo test son funciones puras, sin DOM.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
