import { useState } from "react";
import { reindexAll } from "../../lib/ai/search";
import { clearAllVotes } from "../../lib/feedback";
import { describeError } from "../../lib/errors";

// ---------- Búsqueda e IA ----------
export function SearchAiSection() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);

  async function reindex() {
    setBusy(true);
    setMsg("");
    try {
      const n = await reindexAll((d, t) => setMsg(`Reindexando ${d}/${t}…`));
      setMsg(`✅ Índice reconstruido (${n} candidatos).`);
    } catch (e) {
      setMsg("Error: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    setMsg("");
    try {
      await clearAllVotes();
      setConfirmForget(false);
      setMsg("✅ Preferencias borradas. El ranking vuelve a neutro.");
    } catch (e) {
      setMsg("No se pudieron borrar las preferencias: " + describeError(e));
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <p className="card__title">Índice de búsqueda</p>
        <p className="card__intro">
          Reconstruye los vectores de búsqueda desde cero. Útil si notas
          resultados raros. Puede tardar un poco.
        </p>
        <div className="actions">
          <button className="btn-secondary" onClick={reindex} disabled={busy}>
            {busy ? "…" : "Reconstruir índice"}
          </button>
        </div>
      </section>

      <section className="card">
        <p className="card__title">Preferencias aprendidas</p>
        <p className="card__intro">
          Zalent aprende de tus 👍/👎 para reordenar. Puedes borrarlas y empezar
          de cero.
        </p>
        {confirmForget ? (
          <div className="actions">
            <button className="btn-danger" onClick={forget} disabled={busy}>
              Sí, olvidar
            </button>
            <button className="btn-ghost" onClick={() => setConfirmForget(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <div className="actions">
            <button
              className="btn-secondary"
              onClick={() => setConfirmForget(true)}
            >
              Olvidar mis preferencias
            </button>
          </div>
        )}
      </section>

      {msg && <p className="card__hint">{msg}</p>}
    </>
  );
}
