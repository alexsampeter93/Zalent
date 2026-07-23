import { useEffect, useState } from "react";
import { STATUSES } from "../lib/candidates";
import { EmptyState } from "../components/EmptyState";
import {
  listVacancies,
  listVacancyCandidates,
  setCandidateStage,
  type VacancyWithCount,
  type VacancyCandidate,
} from "../lib/vacancies";
import { reportError } from "../lib/errors";

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function Pipeline() {
  const [vacancies, setVacancies] = useState<VacancyWithCount[]>([]);
  const [vacancyId, setVacancyId] = useState<number | null>(null);
  const [cands, setCands] = useState<VacancyCandidate[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [vacLoaded, setVacLoaded] = useState(false);
  const [candsLoading, setCandsLoading] = useState(false);

  // Cargar la lista de ofertas y elegir la primera por defecto.
  useEffect(() => {
    (async () => {
      try {
        const vs = await listVacancies();
        setVacancies(vs);
        setVacancyId((cur) => cur ?? (vs[0]?.id ?? null));
      } catch (e) {
        reportError("No se pudieron cargar las ofertas del pipeline", e);
      } finally {
        setVacLoaded(true);
      }
    })();
  }, []);

  async function loadCands(vId: number) {
    setCandsLoading(true);
    try {
      setCands(await listVacancyCandidates(vId));
    } catch (e) {
      reportError("No se pudieron cargar los candidatos del pipeline", e);
    } finally {
      setCandsLoading(false);
    }
  }
  useEffect(() => {
    if (vacancyId != null) loadCands(vacancyId);
    else setCands([]);
  }, [vacancyId]);

  async function move(candidateId: number, stage: string) {
    if (vacancyId == null) return;
    // Optimista: movemos la tarjeta al instante, luego persistimos.
    setCands((cs) => cs.map((c) => (c.id === candidateId ? { ...c, stage } : c)));
    try {
      await setCandidateStage(candidateId, vacancyId, stage);
    } catch (e) {
      loadCands(vacancyId); // si falla, recargamos el estado real
      // Sin el aviso, la tarjeta volvía sola a su columna y parecía un fallo
      // del arrastre, no un error de guardado.
      reportError("No se pudo mover al candidato de fase", e);
    }
  }

  function onDrop(stage: string) {
    if (draggingId != null) {
      const c = cands.find((x) => x.id === draggingId);
      if (c && c.stage !== stage) move(draggingId, stage);
    }
    setDraggingId(null);
    setOverCol(null);
  }

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <div className="pipeline-head">
          <div>
            <h1 className="screen__title">Pipeline</h1>
            <p className="screen__sub">
              Arrastra las tarjetas entre fases. Cada oferta tiene su propio tablero.
            </p>
          </div>
          {vacancies.length > 0 && (
            <label className="pipeline-picker">
              <span>Oferta</span>
              <select
                value={vacancyId ?? ""}
                onChange={(e) => setVacancyId(Number(e.target.value))}
              >
                {vacancies.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} ({v.candidate_count})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {!vacLoaded ? (
        <div className="screen-scroll" />
      ) : vacancies.length === 0 ? (
        <div className="screen-scroll">
          <EmptyState
            image="coco-thinking-cv"
            title="Todavía no hay ofertas"
            subtitle="Crea una oferta en Vacantes y asígnale candidatos; aquí gestionarás su pipeline por fases."
          />
        </div>
      ) : candsLoading ? (
        <div className="screen-scroll" />
      ) : cands.length === 0 ? (
        <div className="screen-scroll">
          <EmptyState
            peek="olaz-peek-wave"
            title="Esta oferta aún no tiene candidatos"
            subtitle="Ve a Vacantes, abre la oferta y usa “Puntuar candidatos y añadir” para llenar el tablero."
          />
        </div>
      ) : (
        <div className="kanban">
          {STATUSES.map((s) => {
            const col = cands.filter((c) => (c.stage || "nuevo") === s.key);
            return (
              <div
                key={s.key}
                className={"kanban__col" + (overCol === s.key ? " is-over" : "")}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overCol !== s.key) setOverCol(s.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setOverCol((c) => (c === s.key ? null : c));
                  }
                }}
                onDrop={() => onDrop(s.key)}
              >
                <div className={"kanban__head st-" + s.key}>
                  {s.label}
                  <span className="kanban__count">{col.length}</span>
                </div>
                <div className="kanban__list">
                  {col.length === 0 && (
                    <div className="kanban__empty">Suelta aquí</div>
                  )}
                  {col.map((c) => (
                    <div
                      key={c.id}
                      className={
                        "kanban__card st-border-" + s.key +
                        (draggingId === c.id ? " is-dragging" : "")
                      }
                      draggable
                      onDragStart={() => setDraggingId(c.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverCol(null);
                      }}
                    >
                      <span className="avatar">{initials(c.full_name)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="candidate-name" style={{ fontSize: 13 }}>
                          {c.full_name || "(sin nombre)"}
                        </div>
                        <div className="candidate-meta">{c.headline || "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
