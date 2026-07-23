import { useEffect, useState } from "react";
import { wipeAllData, listCandidates, type CandidateRow } from "../../lib/candidates";
import { loadDemoData } from "../../lib/demoData";
import { openDataDir, dataDirSize, formatBytes } from "../../lib/system";
import { describeError, reportError } from "../../lib/errors";

// ---------- Datos ----------
const RETENTION_KEY = "zalent-retention-months";

// Fecha de creación (SQLite guarda UTC "YYYY-MM-DD HH:MM:SS").
function parseCreated(s: string): number {
  return new Date(s.replace(" ", "T") + "Z").getTime();
}

export function DataSection({ onWiped }: { onWiped: () => void }) {
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
