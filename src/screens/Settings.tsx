import { useEffect, useState } from "react";
import { wipeAllData } from "../lib/candidates";
import {
  hasMasterPassword,
  setMasterPassword,
  removeMasterPassword,
  cryptoSelftest,
  encryptAllCvs,
} from "../lib/lock";

// Ajustes → Privacidad y seguridad: transparencia + derecho al olvido (RGPD).
export function Settings({ onWiped }: { onWiped: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [done, setDone] = useState(false);

  // Contraseña maestra
  const [hasPw, setHasPw] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [removePw, setRemovePw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [encMsg, setEncMsg] = useState("");
  const [encBusy, setEncBusy] = useState(false);

  async function onSelftest() {
    setEncBusy(true);
    setEncMsg("");
    try {
      const ok = await cryptoSelftest();
      setEncMsg(ok ? "✅ El motor de cifrado funciona correctamente." : "⚠️ El autotest falló.");
    } catch (e) {
      setEncMsg("Error: " + String(e));
    } finally {
      setEncBusy(false);
    }
  }

  async function onEncryptAll() {
    setEncBusy(true);
    setEncMsg("");
    try {
      const n = await encryptAllCvs();
      setEncMsg(`✅ Cifrados ${n} archivo(s). Tus CVs ya están cifrados en disco.`);
    } catch (e) {
      setEncMsg("Error: " + String(e));
    } finally {
      setEncBusy(false);
    }
  }

  useEffect(() => {
    hasMasterPassword().then(setHasPw).catch(() => {});
  }, []);

  async function onSetPw() {
    if (pw1.length < 4) {
      setPwMsg("Usa al menos 4 caracteres.");
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg("Las contraseñas no coinciden.");
      return;
    }
    setPwBusy(true);
    setPwMsg("");
    try {
      await setMasterPassword(pw1);
      setHasPw(true);
      setPw1("");
      setPw2("");
      setPwMsg("✅ Contraseña activada. Te la pedirá al abrir la app.");
    } catch (e) {
      console.error(e);
      setPwMsg("Error al guardar la contraseña.");
    } finally {
      setPwBusy(false);
    }
  }

  async function onRemovePw() {
    setPwBusy(true);
    setPwMsg("");
    try {
      const ok = await removeMasterPassword(removePw);
      if (ok) {
        setHasPw(false);
        setRemovePw("");
        setPwMsg("✅ Contraseña quitada.");
      } else {
        setPwMsg("Contraseña incorrecta.");
      }
    } catch (e) {
      console.error(e);
      setPwMsg("Error.");
    } finally {
      setPwBusy(false);
    }
  }

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

        <div className="panel-card">
          <h2 className="panel-card__title">🔑 Contraseña maestra</h2>
          {!hasPw ? (
            <>
              <p className="card__intro">
                Protege el acceso a la app con una contraseña que te pedirá al
                abrir. <strong>No hay recuperación</strong>: si la olvidas, no
                podrás entrar. (De momento <strong>bloquea la app</strong>; el
                cifrado de los archivos llegará en el siguiente paso.)
              </p>
              <label className="field">
                <span>Nueva contraseña</span>
                <input
                  type="password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Repítela</span>
                <input
                  type="password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </label>
              <div className="actions">
                <button onClick={onSetPw} disabled={pwBusy || !pw1}>
                  {pwBusy ? "Guardando…" : "Activar contraseña"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="card__intro">
                La app está protegida con contraseña maestra. Para quitarla,
                introdúcela:
              </p>
              <label className="field">
                <span>Contraseña actual</span>
                <input
                  type="password"
                  value={removePw}
                  onChange={(e) => setRemovePw(e.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  className="btn-danger"
                  onClick={onRemovePw}
                  disabled={pwBusy || !removePw}
                >
                  {pwBusy ? "…" : "Quitar contraseña"}
                </button>
              </div>
            </>
          )}
          {pwMsg && <p className="card__hint">{pwMsg}</p>}
        </div>

        {hasPw && (
          <div className="panel-card">
            <h2 className="panel-card__title">🔐 Cifrado de archivos</h2>
            <p className="card__intro">
              Cifra los CVs guardados en disco con tu contraseña. Después,{" "}
              <strong>sin tu contraseña son ilegibles</strong> (protección en
              reposo real). Antes de cifrar, haz una <strong>copia de seguridad</strong>{" "}
              y pulsa “Comprobar cifrado”. La migración cifra, verifica y solo
              entonces reemplaza (si algo falla, no toca el original).
            </p>
            <div className="actions">
              <button
                className="btn-secondary"
                onClick={onSelftest}
                disabled={encBusy}
              >
                Comprobar cifrado
              </button>
              <button onClick={onEncryptAll} disabled={encBusy}>
                {encBusy ? "…" : "Cifrar mis archivos"}
              </button>
            </div>
            {encMsg && <p className="card__hint">{encMsg}</p>}
          </div>
        )}

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
