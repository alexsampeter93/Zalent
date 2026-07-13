import { useState, type ReactNode } from "react";
import { indexAllCandidates, search, type SearchHit } from "../lib/ai/search";

// Resalta en el texto las palabras de la búsqueda (evidencia visible).
function highlight(text: string, query: string): ReactNode[] {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((t) => t.length >= 3),
    ),
  );
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) =>
      terms.includes(part.toLowerCase()) ? (
        <mark key={i}>{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
}

// Panel TEMPORAL de búsqueda semántica sobre los candidatos reales.
// Se integrará en la pantalla "Candidatos" definitiva (con la marca Olaz).
export function SearchLab() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);

  async function onSearch() {
    if (query.trim() === "") return;
    setBusy(true);
    setHits([]);
    try {
      // 1) Asegurar que todos los candidatos tienen su vector calculado.
      setStatus("Preparando (indexando CVs nuevos)…");
      await indexAllCandidates((done, total) => {
        if (total > 0) setStatus(`Indexando candidatos: ${done} / ${total}…`);
      });
      // 2) Buscar por significado.
      setStatus("Buscando por significado…");
      const results = await search(query.trim());
      setHits(results);
      setSearched(true);
      setStatus(
        results.length === 0
          ? "No hay candidatos indexados todavía. Importa algún CV."
          : "",
      );
    } catch (e) {
      setStatus("Error: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <p className="card__title">🔍 Buscar candidatos (semántica)</p>
      <p className="card__intro">
        Describe lo que buscas en lenguaje natural. Ordena tus candidatos por
        significado, no por palabra exacta.
      </p>
      <form
        className="row"
        style={{ gap: "0.5rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="p.ej. persona con experiencia en almacén y pedidos online"
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={busy}>
          {busy ? "…" : "Buscar"}
        </button>
      </form>

      {status && (
        <p className="card__intro" style={{ marginTop: "0.75rem" }}>
          {status}
        </p>
      )}

      {searched && hits.length > 0 && (
        <ul className="candidate-list">
          {hits.map((h) => (
            <li key={h.id} className="note-item">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <div className="candidate-name">
                    {h.full_name || "(sin nombre)"}
                  </div>
                  <div className="candidate-meta">
                    {h.headline || h.source_file || "—"}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "var(--mono, monospace)",
                    color: "#059669",
                    fontWeight: 700,
                  }}
                >
                  {(h.score * 100).toFixed(0)}%
                </span>
              </div>
              <div
                className="meter"
                style={{
                  height: 4,
                  background: "#e5e7eb",
                  borderRadius: 3,
                  marginTop: 6,
                }}
              >
                <i
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.max(0, h.score * 100)}%`,
                    background: "#4f46e5",
                    borderRadius: 3,
                  }}
                />
              </div>
              {h.evidence && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "12.5px",
                    color: "var(--muted, #6b7280)",
                    borderLeft: "2px solid #4f46e5",
                    paddingLeft: "10px",
                    lineHeight: 1.5,
                  }}
                >
                  {highlight(h.evidence, query)}
                </p>
              )}
              {h.matched.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {h.matched.map((m) => (
                    <span
                      key={m}
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "#fef3c7",
                        color: "#92400e",
                        fontWeight: 600,
                      }}
                    >
                      coincide: {m}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
