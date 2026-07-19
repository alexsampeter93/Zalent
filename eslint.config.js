// Configuración de ESLint (formato "flat config", el de ESLint 9+).
//
// Qué aporta esto que NO haga ya TypeScript: TS comprueba TIPOS ("le pasas un
// número donde va texto"); ESLint comprueba PRÁCTICAS ("este useEffect usa una
// variable que no declaró como dependencia, así que leerá un valor viejo").
// Para Zalent, tras partir App.tsx en hooks, las reglas de React Hooks son las
// que más valor tienen. Ver Diario, entrada 43.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // Nada de lo generado o de terceros: solo NUESTRO código fuente.
    ignores: [
      "dist/**",
      "public/**", // modelo de IA y runtime WASM (no es código nuestro)
      "src-tauri/**", // Rust y sus artefactos; el fork vendorizado no se lintea
      "coverage/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Vite recarga en caliente mejor si cada fichero exporta un solo
      // componente; avisa, no bloquea.
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // DECISIÓN DELIBERADA (no es "bajarlo para que pase"): esta regla viene
      // del futuro compilador de React y marca el patrón
      // `useEffect(() => { cargarDatos() }, [])`, que es el estándar del
      // ecosistema y el que Zalent usa en 5 pantallas. No señala bugs: señala
      // un render de más. En una app local, con consultas a SQLite que tardan
      // milisegundos, eso no se nota; evitarlo exigiría reestructurar interfaz
      // que ya funciona o meter una librería de carga de datos.
      // Se deja como AVISO para que siga siendo visible y se pueda revisar el
      // día que se adopte el compilador de React. Ver Diario, entrada 43.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Los tests usan APIs de Node (process, etc.) además de las del navegador.
    files: ["**/*.test.ts", "**/*.test.tsx", "scripts/**/*.mjs", "*.config.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
