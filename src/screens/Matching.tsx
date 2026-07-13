import { useState } from "react";
import { indexAllCandidates } from "../lib/ai/search";
import { matchOffer, deriveRequirements, type MatchResult } from "../lib/ai/match";

const RELEVANT_FLOOR = 0.35;
function band(score: number): string {
  if (score >= 0.6) return "match--alta";
  if (score >= RELEVANT_FLOOR) return "match--media";
  return "match--baja";
}
function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function Matching() {
  const [offer, setOffer] = useState("");
  const [reqInput, setReqInput] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<MatchResult[] | null>(null);

  function autofillReqs() {
    if (offer.trim() === "") return;
    setReqInput(deriveRequirements(offer).join(", "));
  }

  async function run() {
    if (offer.trim() === "") return;
    setRunning(true);
    setResults(null);
    try {
      setStatus("Preparando (indexando CVs)…");
      await indexAllCandidates((d, t) => {
        if (t > 0) setStatus(`Indexando candidatos: ${d} / ${t}…`);
      });
      setStatus("Puntuando candidatos…");
      const reqs = reqInput.split(",").map((s) => s.trim()).filter(Boolean);
      setResults(await matchOffer(offer.trim(), reqs));
      setStatus("");
    } catch (e) {
      setStatus("Error: " + String(e));
    } finally {
      setRunning(false);
    }
  }

  const relevant = results ? results.filter((r) => r.fit >= RELEVANT_FLOOR).length : 0;

  return (
    <div className="screen screen--wide">
      <div className="screen__head">
        <h1 className="screen__title">Matching IA</h1>
        <p className="screen__sub">
          Pega una oferta y puntúa a todos tus candidatos: encaje, qué cumplen y
          qué les falta.
        </p>
      </div>

      <section className="card">
        <p className="card__title">Oferta de empleo</p>
        <textarea
          className="offer-text"
          rows={7}
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="Pega aquí la descripción de la oferta (puesto, requisitos, tareas…)"
        />
        <label className="field" style={{ marginTop: "0.9rem" }}>
          <span className="field__label">
            Requisitos clave (separados por comas)
          </span>
          <div className="row" style={{ gap: "0.5rem" }}>
            <input
              style={{ flex: 1 }}
              value={reqInput}
              onChange={(e) => setReqInput(e.target.value)}
              placeholder="p.ej. almacén, carretillero, inglés"
            />
            <button className="btn-secondary" type="button" onClick={autofillReqs}>
              Detectar del texto
            </button>
          </div>
        </label>
        <div className="actions">
          <button onClick={run} disabled={running || offer.trim() === ""}>
            {running ? "Puntuando…" : "Puntuar candidatos"}
          </button>
        </div>
        {status && <p className="card__intro">{status}</p>}
      </section>

      {results && (
        <>
          <div className="results-head">
            <img
              src={`/olaz/${relevant > 0 ? "coco-thumbsup-cv" : "coco-thinking-cv"}.png`}
              alt="Olaz"
            />
            <div>
              <strong>
                {relevant > 0
                  ? `Olaz destaca ${relevant} candidato${relevant !== 1 ? "s" : ""}`
                  : "Olaz no ve un encaje claro"}
              </strong>
              <span>
                {relevant > 0
                  ? "ordenados por encaje con la oferta"
                  : "revisa la oferta o añade requisitos clave"}
              </span>
            </div>
          </div>

          {results.map((r) => (
            <section className="card" key={r.id}>
              <div className="match-row__head">
                <span className="avatar">{initials(r.full_name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="candidate-name">{r.full_name || "(sin nombre)"}</div>
                  <div className="candidate-meta">{r.headline || r.source_file || "—"}</div>
                </div>
                <span className={"match " + band(r.fit)}>
                  {(r.fit * 100).toFixed(0)}%
                </span>
              </div>
              <div className="meter" style={{ height: 5, marginTop: 8 }}>
                <i
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.max(0, r.fit * 100)}%`,
                    background: "var(--gold-deep)",
                    borderRadius: 3,
                  }}
                />
              </div>
              {r.matched.length > 0 && (
                <div className="chips" style={{ marginTop: 10 }}>
                  {r.matched.map((m) => (
                    <span key={m} className="chip-ok">✓ {m}</span>
                  ))}
                </div>
              )}
              {r.missing.length > 0 && (
                <div className="chips" style={{ marginTop: 6 }}>
                  {r.missing.map((m) => (
                    <span key={m} className="chip-gap">✗ falta: {m}</span>
                  ))}
                </div>
              )}
              {r.evidence && (
                <p className="why__quote" style={{ marginTop: 10 }}>{r.evidence}</p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
