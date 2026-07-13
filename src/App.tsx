import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./lib/db";
import "./App.css";

function App() {
  // Estado local: el texto que devuelve el "cerebro" nativo (Rust).
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  // Estado de la base de datos: qué tablas existen (o el error si falla).
  const [tables, setTables] = useState<string[]>([]);
  const [dbError, setDbError] = useState<string>("");

  // Al abrir la app: cargar la BD (esto aplica las migraciones = crea las
  // tablas la primera vez) y listar las tablas como prueba de que funciona.
  useEffect(() => {
    getDb()
      .then((db) =>
        db.select<{ name: string }[]>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_sqlx_migrations' ORDER BY name",
        ),
      )
      .then((rows) => setTables(rows.map((r) => r.name)))
      .catch((e) => setDbError(String(e)));
  }, []);

  // Llama a la función `greet` definida en Rust (src-tauri/src/lib.rs)
  // y guarda su respuesta. Es la prueba de que React (la cara) puede
  // hablar con Rust (el cerebro nativo).
  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="container">
      <header className="hero">
        <h1 className="brand">Zalent</h1>
        <p className="tagline">
          Gestor de CVs y talento local-first con IA
        </p>
      </header>

      <section className="card">
        <p className="card__intro">
          Prueba del puente <strong>React ↔ Rust</strong>: escribe tu nombre y
          el motor nativo te saludará.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            greet();
          }}
        >
          <input
            id="greet-input"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Escribe tu nombre..."
          />
          <button type="submit">Saludar</button>
        </form>
        {greetMsg && <p className="greet-msg">{greetMsg}</p>}
      </section>

      <section className="card">
        <p className="card__intro">Estado de la base de datos local</p>
        {dbError ? (
          <p className="db-error">Error: {dbError}</p>
        ) : tables.length > 0 ? (
          <p className="db-ok">
            ✅ Conectada · Tablas: {tables.join(", ")}
          </p>
        ) : (
          <p className="card__intro">Conectando…</p>
        )}
      </section>

      <footer className="foot">Fase 1 · Datos + Ingesta</footer>
    </main>
  );
}

export default App;
