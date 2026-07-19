import { useEffect, useState, type ReactNode } from "react";
import { wipeAllData, listCandidates, type CandidateRow } from "../lib/candidates";
import { loadDemoData } from "../lib/demoData";
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
} from "../lib/lock";
import { describeError, reportError } from "../lib/errors";
import { useThemeMode, type ThemeMode } from "../lib/theme";
import { openDataDir, dataDirSize, formatBytes } from "../lib/system";
import { reindexAll } from "../lib/ai/search";
import { clearAllVotes } from "../lib/feedback";
import { ollamaStatus, ollamaExtract, AI_MODEL, type OllamaResult } from "../lib/ai/ollama";
import { getDb } from "../lib/db";

type Section =
  | "apariencia"
  | "privacidad"
  | "seguridad"
  | "datos"
  | "busqueda"
  | "acerca";

// --- Iconos (SVG, en línea con el estilo del resto de la app) ---
const ICONS: Record<Section, ReactNode> = {
  apariencia: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
    </svg>
  ),
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
  busqueda: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  acerca: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
};

const SECTIONS: { key: Section; title: string; desc: string }[] = [
  { key: "privacidad", title: "Privacidad", desc: "Dónde viven tus datos y qué sale (nada) del equipo." },
  { key: "seguridad", title: "Seguridad", desc: "Contraseña maestra y cifrado de los CVs." },
  { key: "busqueda", title: "Búsqueda e IA", desc: "Índice de búsqueda y preferencias aprendidas." },
  { key: "datos", title: "Datos", desc: "Almacenamiento y borrado total (derecho al olvido)." },
  { key: "apariencia", title: "Apariencia", desc: "Tema claro, oscuro o el del sistema." },
  { key: "acerca", title: "Acerca de", desc: "Versión, marca y créditos." },
];

export function Settings({ onWiped }: { onWiped: () => void }) {
  const [section, setSection] = useState<Section>("privacidad");
  const current = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Ajustes</h1>
      </div>

      <div className="settings2">
        <nav className="settings2__nav">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={"settings2__item" + (section === s.key ? " active" : "")}
              onClick={() => setSection(s.key)}
            >
              <span className="settings2__icon">{ICONS[s.key]}</span>
              <span>{s.title}</span>
            </button>
          ))}
        </nav>

        <div className="settings2__panel">
          <div className="settings2__head">
            <h2>{current.title}</h2>
            <p>{current.desc}</p>
          </div>
          <div className="settings2__content">
            {section === "privacidad" && <PrivacySection />}
            {section === "seguridad" && <SecuritySection />}
            {section === "busqueda" && <SearchAiSection />}
            {section === "datos" && <DataSection onWiped={onWiped} />}
            {section === "apariencia" && <AppearanceSection />}
            {section === "acerca" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

// Fila etiqueta → valor (estilo preferencias).
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-row">
      <span className="set-row__label">{label}</span>
      <span className="set-row__value">{value}</span>
    </div>
  );
}

// ---------- Privacidad ----------
function PrivacySection() {
  return (
    <>
      <div className="set-hero">
        <span className="set-hero__big">100%</span>
        <div>
          <div className="set-hero__t">Datos en tu equipo</div>
          <div className="set-hero__s">
            Cero llamadas a servidores externos. Nada va a la nube ni a Anthropic.
          </div>
        </div>
      </div>
      <div className="set-rows">
        <Row label="Ubicación de los datos" value="Este equipo" />
        <Row label="Telemetría / analítica" value="Ninguna" />
        <Row label="Modelo de IA" value="Local (offline)" />
        <Row label="Borrado de candidatos" value="Real, sin papelera" />
      </div>
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

// ---------- Datos ----------
const RETENTION_KEY = "zalent-retention-months";

// Fecha de creación (SQLite guarda UTC "YYYY-MM-DD HH:MM:SS").
function parseCreated(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

function DataSection({ onWiped }: { onWiped: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [wiping, setWiping] = useState(false);
  const [done, setDone] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoMsg, setDemoMsg] = useState("");
  const [cands, setCands] = useState<CandidateRow[] | null>(null);
  // Momento en que se cargaron los candidatos. Se guarda aquí en vez de leer
  // Date.now() al calcular `oldCount` más abajo: leer la hora durante el
  // render hace que el resultado dependa del instante exacto en que React
  // pinte, y React no garantiza cuántas veces ni cuándo lo hace.
  const [loadedAt, setLoadedAt] = useState(0);
  const [size, setSize] = useState<number | null>(null);
  const [retention, setRetention] = useState<number>(() =>
    Number(localStorage.getItem(RETENTION_KEY) || "0"),
  );

  useEffect(() => {
    listCandidates()
      .then((rows) => {
        setCands(rows);
        setLoadedAt(Date.now());
      })
      .catch(() => {});
    dataDirSize().then(setSize).catch(() => {});
  }, [done]);

  const count = cands?.length ?? null;
  const oldCount =
    retention > 0 && cands
      ? cands.filter(
          (c) =>
            c.created_at &&
            parseCreated(c.created_at) < loadedAt - retention * 30 * 864e5,
        ).length
      : 0;

  function changeRetention(m: number) {
    setRetention(m);
    localStorage.setItem(RETENTION_KEY, String(m));
  }

  async function loadDemo() {
    setLoadingDemo(true);
    setDemoMsg("");
    try {
      const r = await loadDemoData();
      setDemoMsg(`✅ Cargados ${r.candidates} candidatos y ${r.vacancies} vacantes de ejemplo.`);
      onWiped(); // mismo callback de "refresca todo": aquí se reutiliza para "los datos cambiaron"
    } catch (e) {
      console.error(e);
      setDemoMsg("Error al cargar los datos de ejemplo: " + describeError(e));
    } finally {
      setLoadingDemo(false);
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
      // Este era el peor de todos: el borrado total fallaba en silencio y la
      // pantalla se quedaba igual. El usuario podía irse pensando que sus datos
      // ya no estaban, cuando seguían ahí enteros.
      reportError("No se pudieron borrar todos los datos", e);
    } finally {
      setWiping(false);
    }
  }

  return (
    <>
      <section className="card">
        <p className="card__title">Almacenamiento</p>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat__n">{count ?? "…"}</span>
            <span className="stat__l">candidatos</span>
          </div>
          <div className="stat">
            <span className="stat__n">{size != null ? formatBytes(size) : "…"}</span>
            <span className="stat__l">en disco</span>
          </div>
        </div>
        <p className="card__intro">
          Todo se guarda en la carpeta de datos de la app, en tu equipo. Ábrela
          para hacer copias de seguridad.
        </p>
        <div className="actions">
          <button className="btn-secondary" onClick={() => openDataDir()}>
            Abrir carpeta de datos
          </button>
        </div>
      </section>

      <section className="card">
        <p className="card__title">Retención de datos</p>
        <p className="card__intro">
          El RGPD pide no guardar datos personales más de lo necesario. Marca a
          partir de cuándo un CV se considera “antiguo” para revisarlo o borrarlo.
        </p>
        <div className="set-row">
          <span className="set-row__label">Avisar de CVs con más de</span>
          <select
            className="set-select"
            value={retention}
            onChange={(e) => changeRetention(Number(e.target.value))}
          >
            <option value={0}>Desactivado</option>
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={24}>24 meses</option>
          </select>
        </div>
        {retention > 0 && (
          <p className="card__hint">
            {oldCount === 0 ? (
              <>Ningún candidato supera el límite. 👍</>
            ) : (
              <>
                <strong>{oldCount}</strong>{" "}
                {oldCount === 1 ? "candidato supera" : "candidatos superan"} el
                límite. Revísalos en Candidatos (orden “Más antiguos”) y bórralos
                o anonimízalos si ya no los necesitas.
              </>
            )}
          </p>
        )}
      </section>

      <section className="card">
        <p className="card__title">Datos de ejemplo</p>
        <p className="card__intro">
          Añade 14 candidatos y 3 vacantes ficticias, con el pipeline ya
          poblado, para poder enseñar Zalent sin usar CVs reales. Se pueden
          borrar después con “Borrar todos los datos”, más abajo.
        </p>
        <div className="actions">
          <button className="btn-secondary" onClick={loadDemo} disabled={loadingDemo}>
            {loadingDemo ? "Cargando…" : "Cargar datos de ejemplo"}
          </button>
        </div>
        {demoMsg && <p className="db-ok">{demoMsg}</p>}
      </section>

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
    </>
  );
}

// ---------- Apariencia ----------
function AppearanceSection() {
  const [mode, setThemeMode] = useThemeMode();
  const opts: { key: ThemeMode; label: string }[] = [
    { key: "light", label: "Claro" },
    { key: "dark", label: "Oscuro" },
    { key: "system", label: "Sistema" },
  ];
  return (
    <section className="card">
      <p className="card__title">Tema</p>
      <p className="card__intro">
        Elige el aspecto de la app. “Sistema” sigue la preferencia de tu
        ordenador.
      </p>
      <div className="theme-opts">
        {opts.map((o) => (
          <button
            key={o.key}
            className={"theme-opt" + (mode === o.key ? " is-on" : "")}
            onClick={() => setThemeMode(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- Búsqueda e IA ----------
function SearchAiSection() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  // --- Temporal (spike Ollama): ¿un modelo BUENO extrae la ficha en español? ---
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmStep, setLlmStep] = useState("");
  const [llmReport, setLlmReport] = useState<OllamaResult | null>(null);
  const [status, setStatus] = useState<{ running: boolean; models: string[]; error: string } | null>(null);
  const [model, setModel] = useState(AI_MODEL);

  async function checkStatus() {
    setStatus(await ollamaStatus());
  }

  async function runLlm() {
    setLlmBusy(true);
    setLlmReport(null);
    setLlmStep("Leyendo el CV… (un 7B por CPU tarda; ten paciencia)");
    try {
      const db = await getDb();
      const rows = await db.select<{ raw_text: string | null }[]>(
        "SELECT raw_text FROM candidates WHERE raw_text IS NOT NULL ORDER BY id DESC LIMIT 1",
      );
      const text = rows[0]?.raw_text;
      if (!text) {
        setLlmReport({
          ms: 0, raw: "", parsed: null, fields: null, rejected: [],
          error: "No hay ningún CV con texto en la base. Importa uno primero.",
        });
        return;
      }
      setLlmReport(await ollamaExtract(model, text));
    } catch (e) {
      setLlmReport({
        ms: 0, raw: "", parsed: null, fields: null, rejected: [], error: String(e),
      });
    } finally {
      setLlmBusy(false);
      setLlmStep("");
    }
  }

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
      {/* --- Temporal (spike Ollama) --- */}
      <section className="card">
        <p className="card__title">Diagnóstico: Ollama</p>
        <p className="card__intro">
          Ollama corre fuera de Zalent, de forma nativa: sin los límites de
          memoria del navegador. Le pedimos la ficha de tu CV más reciente. El
          CV va a un programa de tu equipo — no sale a internet.
        </p>
        <div className="actions">
          <button className="btn-secondary" onClick={checkStatus} disabled={llmBusy}>
            Comprobar Ollama
          </button>
          <input
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ maxWidth: 190 }}
          />
          <button className="btn-secondary" onClick={runLlm} disabled={llmBusy}>
            {llmBusy ? "Pensando…" : "Extraer ficha"}
          </button>
        </div>

        {status && (
          <ul className="card__intro" style={{ lineHeight: 1.9 }}>
            <li>¿Ollama responde?: <strong>{status.running ? "sí" : "NO"}</strong></li>
            <li>Modelos: <strong>{status.models.join(", ") || "ninguno"}</strong></li>
            {status.error && <li style={{ color: "crimson" }}>{status.error}</li>}
          </ul>
        )}

        {llmStep && <p className="card__intro">{llmStep}</p>}
        {llmReport && (
          <>
            <ul className="card__intro" style={{ lineHeight: 1.9 }}>
              <li>Tiempo: <strong>{(llmReport.ms / 1000).toFixed(1)} s</strong></li>
              {llmReport.error && <li style={{ color: "crimson" }}>{llmReport.error}</li>}
            </ul>
            {llmReport.fields && (
              <>
                <p className="card__title" style={{ marginTop: "1rem" }}>
                  Ficha final (ya validada)
                </p>
                <ul className="card__intro" style={{ lineHeight: 1.9 }}>
                  <li>Nombre: <strong>{llmReport.fields.full_name ?? "—"}</strong></li>
                  <li>Ubicación: <strong>{llmReport.fields.location ?? "—"}</strong></li>
                  <li>Último puesto: <strong>{llmReport.fields.last_position ?? "—"}</strong></li>
                  <li>Años: <strong>{llmReport.fields.years_experience ?? "—"}</strong></li>
                  <li>Estudios: <strong>{llmReport.fields.education ?? "—"}</strong></li>
                  <li>Skills: <strong>{llmReport.fields.skills.join(", ") || "—"}</strong></li>
                  <li>Idiomas: <strong>{llmReport.fields.languages.join(", ") || "—"}</strong></li>
                </ul>
              </>
            )}

            {llmReport.rejected.length > 0 && (
              <>
                <p className="card__title" style={{ marginTop: "1rem" }}>
                  Descartado por el validador ({llmReport.rejected.length})
                </p>
                <ul className="card__intro" style={{ lineHeight: 1.8, color: "crimson" }}>
                  {llmReport.rejected.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            )}

            {llmReport.raw && (
              <>
                <p className="card__title" style={{ marginTop: "1rem" }}>
                  Lo que propuso el modelo (en crudo)
                </p>
                <pre
                  style={{
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    fontSize: "0.78rem", background: "rgba(0,0,0,.05)",
                    padding: "0.75rem", borderRadius: 8, maxHeight: 260,
                    overflow: "auto",
                  }}
                >
                  {llmReport.raw}
                </pre>
              </>
            )}
          </>
        )}
      </section>

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

// ---------- Acerca de ----------
function AboutSection() {
  return (
    <section className="card about">
      <img
        src="/olaz/olaz-avatar-zalent.png"
        alt="Olaz"
        className="about__olaz"
      />
      <p className="about__name">Zalent</p>
      <p className="about__ver">Versión 0.1.0</p>
      <p className="card__intro">
        Gestor de CVs y talento <strong>local-first</strong> con IA. Tus datos,
        en tu equipo. Con Olaz, el coco con cerebro. 🥥🧠
      </p>
    </section>
  );
}
