import { useEffect, useState, type ReactNode } from "react";
import { wipeAllData } from "../lib/candidates";
import {
  hasMasterPassword,
  setMasterPassword,
  removeMasterPassword,
  cryptoSelftest,
  encryptAllCvs,
} from "../lib/lock";

type Section = "privacidad" | "seguridad" | "datos";

// --- Iconos (SVG, en línea con el estilo del resto de la app) ---
const ICONS: Record<Section, ReactNode> = {
  privacidad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" />
    </svg>
  ),
  seguridad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  datos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </svg>
  ),
};

const SECTIONS: { key: Section; title: string; desc: string }[] = [
  { key: "privacidad", title: "Privacidad", desc: "Dónde viven tus datos y qué sale (nada) del equipo." },
  { key: "seguridad", title: "Seguridad", desc: "Contraseña maestra y cifrado de los CVs." },
  { key: "datos", title: "Datos", desc: "Borrado total de la base (derecho al olvido)." },
];

export function Settings({ onWiped }: { onWiped: () => void }) {
  const [section, setSection] = useState<Section | null>(null);

  return (
    <div className="screen screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Ajustes</h1>
        <p className="screen__sub">
          {section
            ? SECTIONS.find((s) => s.key === section)?.desc
            : "Elige una sección para configurarla."}
        </p>
      </div>

      <div className="screen-scroll">
        {section === null ? (
          <div className="settings-list">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                className="settings-row"
                onClick={() => setSection(s.key)}
              >
                <span className="settings-row__icon">{ICONS[s.key]}</span>
                <span className="settings-row__text">
                  <span className="settings-row__title">{s.title}</span>
                  <span className="settings-row__desc">{s.desc}</span>
                </span>
                <span className="settings-row__chev" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <button className="backlink" onClick={() => setSection(null)}>
              ← Volver a Ajustes
            </button>
            {section === "privacidad" && <PrivacySection />}
            {section === "seguridad" && <SecuritySection />}
            {section === "datos" && <DataSection onWiped={onWiped} />}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Privacidad ----------
function PrivacySection() {
  return (
    <>
      <section className="card">
        <p className="card__title">Tus datos, en tu equipo</p>
        <p className="card__intro">
          Todos los CVs y sus datos viven <strong>solo en este ordenador</strong>{" "}
          (una base de datos local y la carpeta de CVs). Zalent{" "}
          <strong>no envía nada a la nube</strong>, ni a Anthropic ni a ningún
          servidor.
        </p>
      </section>
      <section className="card">
        <p className="card__title">La única conexión</p>
        <p className="card__intro">
          La primera vez, la app descarga el <strong>modelo de IA</strong> (para
          buscar por significado). Se descarga <strong>hacia tu equipo</strong>;{" "}
          <strong>tus CVs no salen</strong>. Después funciona sin internet.
        </p>
      </section>
      <section className="card">
        <p className="card__title">Borrado real</p>
        <p className="card__intro">
          Al borrar un candidato se elimina de verdad: su ficha, sus datos y su
          archivo del disco. No hay “papelera” oculta.
        </p>
      </section>
    </>
  );
}

// ---------- Seguridad ----------
function SecuritySection() {
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
      setPwMsg("Error al guardar la contraseña.");
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
      setPwMsg("Error.");
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
    </>
  );
}

// ---------- Datos ----------
function DataSection({ onWiped }: { onWiped: () => void }) {
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
    <div className="danger-zone">
      <p className="card__title">Borrar todos los datos</p>
      {done ? (
        <p className="db-ok">✅ Se han borrado todos los datos.</p>
      ) : !confirmOpen ? (
        <>
          <p className="card__intro">
            Elimina de golpe <strong>TODA</strong> la base: candidatos, ofertas,
            notas, etiquetas, votos y archivos de CV. No se puede deshacer
            (derecho al olvido, RGPD).
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
            <button className="btn-danger" disabled={confirmText !== "BORRAR" || wiping} onClick={wipe}>
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
  );
}
