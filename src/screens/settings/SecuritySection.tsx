import { useEffect, useState } from "react";
import {
  hasMasterPassword,
  setMasterPassword,
  removeMasterPassword,
  cryptoSelftest,
  encryptAllCvs,
  dbEncryptionStatus,
  encryptDatabase,
  deletePlaintextBackups,
  deleteOrphanBackups,
  type DbEncryptionStatus,
} from "../../lib/lock";
import { describeError, reportError } from "../../lib/errors";
import { formatBytes } from "../../lib/system";

// ---------- Seguridad ----------
export function SecuritySection() {
  const [hasPw, setHasPw] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [removePw, setRemovePw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [encMsg, setEncMsg] = useState("");
  const [encBusy, setEncBusy] = useState(false);

  useEffect(() => {
    hasMasterPassword().then(setHasPw).catch(() => {});
  }, []);

  async function onSetPw() {
    if (pw1.length < 4) return setPwMsg("Usa al menos 4 caracteres.");
    if (pw1 !== pw2) return setPwMsg("Las contraseñas no coinciden.");
    setPwBusy(true);
    setPwMsg("");
    try {
      await setMasterPassword(pw1);
      setHasPw(true);
      setPw1("");
      setPw2("");
      setPwMsg("✅ Contraseña activada. Te la pedirá al abrir la app.");
    } catch (e) {
      // Antes decía solo "Error al guardar la contraseña." y el motivo se
      // quedaba en la consola, donde el usuario no va a mirar nunca.
      setPwMsg("Error al guardar la contraseña: " + describeError(e));
      console.error(e);
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
        setPwMsg("✅ Contraseña quitada (los archivos se descifraron).");
      } else setPwMsg("Contraseña incorrecta.");
    } catch (e) {
      setPwMsg("No se pudo quitar la contraseña: " + describeError(e));
      console.error(e);
    } finally {
      setPwBusy(false);
    }
  }

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

  return (
    <>
      <section className="card">
        <p className="card__title">Contraseña maestra</p>
        {!hasPw ? (
          <>
            <p className="card__intro">
              Protege el acceso a la app con una contraseña que te pedirá al
              abrir. <strong>No hay recuperación</strong>: si la olvidas, no
              podrás entrar.
            </p>
            <label className="field">
              <span>Nueva contraseña</span>
              <input type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            </label>
            <label className="field">
              <span>Repítela</span>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
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
              introdúcela (los archivos cifrados se descifrarán):
            </p>
            <label className="field">
              <span>Contraseña actual</span>
              <input type="password" value={removePw} onChange={(e) => setRemovePw(e.target.value)} />
            </label>
            <div className="actions">
              <button className="btn-danger" onClick={onRemovePw} disabled={pwBusy || !removePw}>
                {pwBusy ? "…" : "Quitar contraseña"}
              </button>
            </div>
          </>
        )}
        {pwMsg && <p className="card__hint">{pwMsg}</p>}
      </section>

      {hasPw && (
        <section className="card">
          <p className="card__title">Cifrado de archivos</p>
          <p className="card__intro">
            Cifra los CVs guardados en disco con tu contraseña. Después,{" "}
            <strong>sin tu contraseña son ilegibles</strong>. Antes de cifrar,
            haz una <strong>copia de seguridad</strong> y pulsa “Comprobar
            cifrado”. La migración cifra, verifica y solo entonces reemplaza.
          </p>
          <div className="actions">
            <button className="btn-secondary" onClick={onSelftest} disabled={encBusy}>
              Comprobar cifrado
            </button>
            <button onClick={onEncryptAll} disabled={encBusy}>
              {encBusy ? "…" : "Cifrar mis archivos"}
            </button>
          </div>
          {encMsg && <p className="card__hint">{encMsg}</p>}
        </section>
      )}

      {hasPw && <DatabaseEncryptionCard />}
    </>
  );
}

// Cifrado de la BASE DE DATOS (SQLCipher). Aparte del cifrado de archivos:
// aquello protege los PDF/Word originales; esto protege la ficha de cada
// candidato (nombre, email, teléfono, notas…), que vive en la base de datos.
function DatabaseEncryptionCard() {
  const [status, setStatus] = useState<DbEncryptionStatus | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Borrar las copias es IRREVERSIBLE (son la red de seguridad), así que pide
  // confirmación igual que el resto de acciones destructivas de la app.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    try {
      setStatus(await dbEncryptionStatus());
    } catch (e) {
      reportError("No se pudo consultar el estado del cifrado", e);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onEncrypt() {
    setBusy(true);
    setMsg("");
    try {
      const resumen = await encryptDatabase();
      setMsg("✅ " + resumen);
      setConfirming(false);
      await refresh();
    } catch (e) {
      setMsg("⚠️ " + String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteBackups() {
    setBusy(true);
    setMsg("");
    try {
      const n = await deletePlaintextBackups();
      setMsg(`✅ Borrada(s) ${n} copia(s) sin cifrar. Ya no quedan datos en claro en el disco.`);
      setConfirmingDelete(false);
      await refresh();
    } catch (e) {
      setMsg("⚠️ " + String(e));
    } finally {
      setBusy(false);
    }
  }

  // Sin confirmación, a diferencia de las copias en claro: aquí no se pierde
  // nada recuperable (ver `delete_orphan_backups` en Rust).
  async function onDeleteOrphans() {
    setBusy(true);
    setMsg("");
    try {
      const n = await deleteOrphanBackups();
      setMsg(`✅ Limpiado(s) ${n} archivo(s) sobrante(s).`);
      await refresh();
    } catch (e) {
      setMsg("⚠️ " + String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="card">
      <p className="card__title">
        Cifrado de la base de datos {status.encrypted && "✅"}
      </p>

      {!status.encrypted ? (
        <>
          <p className="card__intro">
            Los CVs cifrados protegen los archivos originales, pero las{" "}
            <strong>fichas</strong> (nombre, email, teléfono, notas, etiquetas)
            viven en la base de datos y hoy están <strong>en claro</strong>:
            cualquiera con acceso a este equipo podría leerlas. Al cifrarla,
            harán falta tu contraseña para abrirlas.
          </p>
          <p className="card__intro">
            El proceso hace una <strong>copia de seguridad</strong> antes de
            nada, cifra a un archivo nuevo, comprueba que no se pierde ningún
            dato y solo entonces reemplaza el original. Si algo falla, tu base
            de datos se queda como está.
          </p>
          {!confirming ? (
            <div className="actions">
              <button onClick={() => setConfirming(true)} disabled={busy}>
                Cifrar la base de datos
              </button>
            </div>
          ) : (
            <div className="confirm-delete">
              <p className="confirm-delete__text">
                ¿Cifrar la base de datos con tu contraseña maestra?{" "}
                <strong>
                  Si olvidas la contraseña, no habrá forma de recuperar estos
                  datos.
                </strong>
              </p>
              <div className="actions">
                <button
                  className="btn-secondary"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button onClick={onEncrypt} disabled={busy}>
                  {busy ? "Cifrando…" : "Sí, cifrar"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="card__intro">
          La base de datos está <strong>cifrada</strong>. Las fichas de tus
          candidatos solo se pueden leer con tu contraseña maestra. Si quitas la
          contraseña, se descifrará automáticamente para que no pierdas el
          acceso.
        </p>
      )}

      {status.backups.length > 0 && (
        <div className="confirm-delete confirm-anon">
          <p className="confirm-delete__text">
            ⚠️ Queda {status.backups.length === 1 ? "una copia" : `${status.backups.length} copias`}{" "}
            <strong>sin cifrar</strong> de la base de datos en el disco (
            {formatBytes(status.backup_bytes)}). Son tu red de seguridad por si
            algo hubiera ido mal, pero mientras existan{" "}
            <strong>tus datos siguen legibles</strong> sin contraseña.
            Compruébalo todo y bórralas.
          </p>
          <ul className="batch-errors">
            {status.backups.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          {!confirmingDelete ? (
            <div className="actions">
              <button
                className="btn-danger"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
              >
                Borrar copias sin cifrar
              </button>
            </div>
          ) : (
            <>
              <p className="confirm-delete__text">
                ¿Seguro? Estas copias son lo único que te permitiría recuperar
                tus datos si el cifrado hubiera salido mal.{" "}
                <strong>
                  Antes de borrarlas, comprueba que tus candidatos, notas y
                  búsquedas funcionan con normalidad.
                </strong>{" "}
                No se pueden deshacer.
              </p>
              <div className="actions">
                <button
                  className="btn-secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button className="btn-danger" onClick={onDeleteBackups} disabled={busy}>
                  {busy ? "Borrando…" : "Sí, borrar"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {status.orphans.length > 0 && (
        <div className="confirm-delete">
          <p className="confirm-delete__text">
            🧹 Hay{" "}
            {status.orphans.length === 1
              ? "un archivo sobrante"
              : `${status.orphans.length} archivos sobrantes`}{" "}
            de migraciones anteriores ({formatBytes(status.orphan_bytes)}). Están
            cifrados con una <strong>contraseña que ya no existe</strong>, así
            que no son un riesgo — pero tampoco sirven para recuperar nada y
            ocupan espacio.
          </p>
          <ul className="batch-errors">
            {status.orphans.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="actions">
            <button
              className="btn-secondary"
              onClick={onDeleteOrphans}
              disabled={busy}
            >
              {busy ? "Limpiando…" : "Limpiar archivos sobrantes"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="card__hint">{msg}</p>}
    </section>
  );
}
