import { useState } from "react";
import { wipeAllData } from "../lib/candidates";

// Ajustes → Privacidad y seguridad: transparencia + derecho al olvido (RGPD).
export function Settings({ onWiped }: { onWiped: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [done, setDone] = useState(false);

  async function wipe() {
    setWiping(true);
    try {
      await wipeAllData();
      setDone(true);
      setConfirmOpen(false);
      setConfirmText("");
      onWiped();
    } catch (e) {
      console.error(e);
    } finally {
      setWiping(false);
    }
  }

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Ajustes</h1>
        <p className="screen__sub">Privacidad y seguridad. Tú tienes el control.</p>
      </div>

      <div className="screen-scroll">
        <div className="panel-card">
          <h2 className="panel-card__title">🔒 Tus datos, en tu equipo</h2>
          <p className="card__intro">
            Todos los CVs y sus datos viven <strong>solo en este ordenador</strong>{" "}
            (una base de datos local y la carpeta de CVs). Zalent{" "}
            <strong>no envía nada a la nube</strong>, ni a Anthropic ni a ningún
            servidor.
          </p>
        </div>

        <div className="panel-card">
          <h2 className="panel-card__title">🌐 La única conexión</h2>
          <p className="card__intro">
            La primera vez, la app descarga el <strong>modelo de IA</strong> (para
            buscar por significado). Se descarga <strong>hacia tu equipo</strong>;{" "}
            <strong>tus CVs no salen</strong>. Después funciona sin internet.
          </p>
        </div>

        <div className="panel-card">
          <h2 className="panel-card__title">🗑️ Borrado real</h2>
          <p className="card__intro">
            Al borrar un candidato se elimina de verdad: su ficha, sus datos y su
            archivo del disco. No hay “papelera” oculta.
          </p>
        </div>

        <div className="danger-zone">
          <h2 className="panel-card__title">Zona peligrosa</h2>
          {done ? (
            <p className="db-ok">✅ Se han borrado todos los datos.</p>
          ) : !confirmOpen ? (
            <>
              <p className="card__intro">
                Elimina de golpe <strong>TODA</strong> la base: candidatos, ofertas,
                notas, etiquetas, votos y archivos de CV. No se puede deshacer.
              </p>
              <button className="btn-danger" onClick={() => setConfirmOpen(true)}>
                Borrar todos los datos
              </button>
            </>
          ) : (
            <div className="danger-zone__confirm">
              <span>
                Escribe <strong>BORRAR</strong> para confirmar. Esto elimina{" "}
                <strong>TODO</strong>, sin vuelta atrás.
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="BORRAR"
                autoFocus
              />
              <div className="actions">
                <button
                  className="btn-danger"
                  disabled={confirmText !== "BORRAR" || wiping}
                  onClick={wipe}
                >
                  {wiping ? "Borrando…" : "Sí, borrar todo"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmText("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
