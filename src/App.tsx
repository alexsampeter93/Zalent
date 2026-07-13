import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  // Estado local: el texto que devuelve el "cerebro" nativo (Rust).
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

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

      <footer className="foot">Fase 0 · Fundamentos</footer>
    </main>
  );
}

export default App;
