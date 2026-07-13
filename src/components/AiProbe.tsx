import { useState } from "react";
import { embed, cosine, getExtractor } from "../lib/ai/embeddings";

// Frases de prueba de oficios variados (industria-agnóstico).
const PHRASES = [
  "Programador de servidores y APIs REST",
  "Desarrolladora full-stack con React y Node",
  "Cocinero de restaurante con diez años de experiencia",
  "Electricista industrial y mantenimiento de maquinaria",
  "Mozo de almacén y preparación de pedidos online",
  "Ingeniera de datos experta en Python y SQL",
];

// Componente TEMPORAL para verificar que la IA local entiende significado.
// Se quitará cuando el buscador esté integrado.
export function AiProbe() {
  const [query, setQuery] = useState("desarrollador backend");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ phrase: string; score: number }[]>(
    [],
  );

  async function run() {
    setLoading(true);
    setResults([]);
    try {
      setStatus("Cargando modelo de IA (la primera vez descarga ~130 MB)…");
      await getExtractor((info) => {
        const p = info as { status?: string; file?: string; progress?: number };
        if (p?.status === "progress" && p.file) {
          setStatus(`Descargando ${p.file}: ${Math.round(p.progress ?? 0)}%`);
        }
      });
      setStatus("Calculando significados…");
      const q = await embed(query);
      const scored = await Promise.all(
        PHRASES.map(async (phrase) => ({
          phrase,
          score: cosine(q, await embed(phrase)),
        })),
      );
      scored.sort((a, b) => b.score - a.score);
      setResults(scored);
      setStatus("Listo ✅ — ordenado por parecido de SIGNIFICADO con tu búsqueda");
    } catch (e) {
      setStatus("Error: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <p className="card__title">🧪 Prueba de IA local (búsqueda semántica)</p>
      <p className="card__intro">
        Escribe una búsqueda y pulsa Probar: la IA ordenará las frases por
        <strong> significado</strong>, no por palabra exacta.
      </p>
      <div className="row" style={{ gap: "0.5rem" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={run} disabled={loading}>
          {loading ? "Procesando…" : "Probar"}
        </button>
      </div>
      {status && <p className="card__intro" style={{ marginTop: "0.75rem" }}>{status}</p>}
      {results.length > 0 && (
        <ul className="candidate-list">
          {results.map((r) => (
            <li key={r.phrase} className="note-item">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span>{r.phrase}</span>
                <span style={{ fontFamily: "var(--mono, monospace)", color: "#059669", fontWeight: 700 }}>
                  {(r.score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="meter" style={{ height: 4, background: "#e5e7eb", borderRadius: 3, marginTop: 6 }}>
                <i style={{ display: "block", height: "100%", width: `${Math.max(0, r.score * 100)}%`, background: "#4f46e5", borderRadius: 3 }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
