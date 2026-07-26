import { defineConfig } from "vitest/config";

// Config de tests separada de vite.config.ts (esa es solo para Tauri dev/build).
// Entorno "node" por defecto: la mayoría de módulos bajo test son funciones
// puras, sin DOM. Los que sí necesitan DOM lo piden fichero a fichero con
// `// @vitest-environment jsdom` en la primera línea.
//
// Se incluyen también los `.test.tsx`: los tests de componentes llevan JSX
// (esbuild lo transforma solo, leyendo `"jsx": "react-jsx"` de tsconfig.json).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
