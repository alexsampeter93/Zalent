import { useEffect, useState } from "react";
import {
  createVacancy,
  listVacancies,
  getVacancy,
  updateVacancy,
  deleteVacancy,
  addCandidateToVacancy,
  removeCandidateFromVacancy,
  listVacancyCandidates,
  type VacancyWithCount,
  type Vacancy,
  type VacancyCandidate,
} from "../lib/vacancies";
import { matchOffer, deriveRequirements, type MatchResult } from "../lib/ai/match";
import { EmptyState } from "../components/EmptyState";
import { reportError } from "../lib/errors";

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function fitBand(fit: number): string {
  if (fit >= 0.66) return "fit-high";
  if (fit >= 0.4) return "fit-mid";
  return "fit-low";
}

export function Vacancies() {
  const [list, setList] = useState<VacancyWithCount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try {
      setList(await listVacancies());
    } catch (e) {
      reportError("No se pudieron cargar las ofertas", e);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Vacantes</h1>
        <p className="screen__sub">
          Tus ofertas de trabajo. Organiza a los candidatos dentro de cada puesto.
        </p>
      </div>

      <div className="screen-scroll">
        {selectedId != null ? (
          <VacancyDetail
            id={selectedId}
            onBack={() => {
              setSelectedId(null);
              refresh();
            }}
            onChanged={refresh}
          />
        ) : creating ? (
          <VacancyCreate
            onCancel={() => setCreating(false)}
            onCreated={(id) => {
              setCreating(false);
              refresh();
              setSelectedId(id);
            }}
          />
        ) : (
          <>
            {!loaded ? null : list.length === 0 ? (
              <EmptyState
                // Cuenta una historia (papeles hechos un lío -> ordenados), así
                // que cada estado necesita verse. Pero las pausas se hacen
                // repitiendo frames a fps alto, no bajando los fps.
                sprite={{
                  name: "olaz-organize",
                  frames: 5,
                  fps: 10,
                  sequence: [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5],
                }}
                title="Aún no tienes ofertas"
                subtitle="Crea tu primera vacante para organizar a los candidatos por puesto, puntuarlos y llevar su pipeline."
                action={{
                  label: "+ Crear primera oferta",
                  onClick: () => setCreating(true),
                }}
              />
            ) : (
              <>
                <div className="vac-toolbar">
                  <span className="vac-toolbar__count">
                    {list.length} {list.length === 1 ? "oferta" : "ofertas"}
                  </span>
                  <button onClick={() => setCreating(true)}>+ Nueva oferta</button>
                </div>
                <div className="vac-grid">
                  {list.map((v) => (
                    <button
                      key={v.id}
                      className="vac-card"
                      onClick={() => setSelectedId(v.id)}
                    >
                      <div className="vac-card__head">
                        <span className="vac-card__icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" />
                            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </span>
                        <span
                          className={
                            "vac-status " +
                            (v.status === "cerrada" ? "is-closed" : "is-open")
                          }
                        >
                          {v.status === "cerrada" ? "Cerrada" : "Abierta"}
                        </span>
                      </div>
                      <div className="vac-card__title">{v.title}</div>
                      <div className="vac-card__meta">
                        <span className="vac-card__count">{v.candidate_count}</span>
                        {v.candidate_count === 1 ? "candidato" : "candidatos"}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Crear oferta ----------
function VacancyCreate({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const id = await createVacancy(title, description);
      onCreated(id);
    } catch (e) {
      reportError("No se pudo crear la oferta", e);
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <button className="backlink" onClick={onCancel}>
        ← Volver
      </button>
      <p className="card__title">Nueva oferta</p>
      <label className="field">
        <span>Título del puesto</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="p.ej. Mozo de almacén, Comercial, Enfermero/a…"
        />
      </label>
      <label className="field">
        <span>Descripción de la oferta (opcional)</span>
        <textarea
          className="offer-text"
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Pega aquí la oferta. Servirá para puntuar candidatos contra este puesto."
        />
      </label>
      <div className="actions">
        <button onClick={save} disabled={saving || !title.trim()}>
          {saving ? "Creando…" : "Crear oferta"}
        </button>
      </div>
    </div>
  );
}

// ---------- Detalle / editar oferta ----------
function VacancyDetail({
  id,
  onBack,
  onChanged,
}: {
  id: number;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [vac, setVac] = useState<Vacancy | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [assigned, setAssigned] = useState<VacancyCandidate[]>([]);
  const [scoring, setScoring] = useState(false);
  const [results, setResults] = useState<MatchResult[] | null>(null);

  const assignedIds = new Set(assigned.map((a) => a.id));

  async function loadAssigned() {
    try {
      setAssigned(await listVacancyCandidates(id));
    } catch (e) {
      reportError("No se pudieron cargar los candidatos de la oferta", e);
    }
  }

  useEffect(() => {
    (async () => {
      const v = await getVacancy(id);
      setVac(v);
      if (v) {
        setTitle(v.title);
        setDescription(v.description);
      }
    })();
    loadAssigned();
  }, [id]);

  async function score() {
    setScoring(true);
    try {
      const reqs = deriveRequirements(description);
      setResults(await matchOffer(description, reqs));
    } catch (e) {
      reportError("No se pudo puntuar a los candidatos contra la oferta", e);
    } finally {
      setScoring(false);
    }
  }

  async function assign(candidateId: number) {
    await addCandidateToVacancy(candidateId, id);
    await loadAssigned();
    onChanged();
  }

  async function unassign(candidateId: number) {
    await removeCandidateFromVacancy(candidateId, id);
    await loadAssigned();
    onChanged();
  }

  if (!vac) return <p className="screen__sub">Cargando…</p>;

  const closed = vac.status === "cerrada";

  async function save() {
    setSaving(true);
    try {
      await updateVacancy(id, { title, description });
      onChanged();
    } catch (e) {
      reportError("No se pudieron guardar los cambios de la oferta", e);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    const next = closed ? "abierta" : "cerrada";
    await updateVacancy(id, { status: next });
    setVac((cur) => (cur ? { ...cur, status: next } : cur));
    onChanged();
  }

  async function doDelete() {
    await deleteVacancy(id);
    onBack();
  }

  return (
    <>
      <button className="backlink" onClick={onBack}>
        ← Volver a las ofertas
      </button>

      {/* Dos columnas: la oferta a la izquierda, los candidatos a la derecha.
          Antes iban apiladas y "Puntuar candidatos" —la función principal de
          esta pantalla— quedaba debajo del corte, con espacio horizontal de
          sobra sin usar. Ahora se ve la oferta y su matching a la vez, y en
          ventanas normales no hace falta scroll. Cada lista larga scrollea
          por su cuenta (ver `.vac-detail` en App.css). */}
      <div className="vac-detail">
        <div className="vac-detail__col">
          <div className="card">
            <label className="field">
              <span>Título del puesto</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>Descripción de la oferta</span>
              <textarea
                className="offer-text"
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <div className="actions">
              <button onClick={save} disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              <button className="btn-ghost" onClick={toggleStatus}>
                {closed ? "Reabrir oferta" : "Cerrar oferta"}
              </button>
            </div>
          </div>

          <div className="danger-zone">
            {confirmDelete ? (
              <div className="danger-zone__confirm">
                <span>
                  ¿Eliminar esta oferta? Se borra la oferta y sus asignaciones.{" "}
                  <strong>Los CVs no se borran</strong> (siguen en tu almacén).
                </span>
                <div className="actions">
                  <button className="btn-danger" onClick={doDelete}>
                    Sí, eliminar oferta
                  </button>
                  <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
                Eliminar oferta
              </button>
            )}
          </div>
        </div>

        <div className="vac-detail__col">
          <div className="card">
            <p className="card__title">
              Candidatos de esta oferta ({assigned.length})
            </p>
            {assigned.length === 0 ? (
              <p className="card__intro">
                Aún no has asignado candidatos. Puntúalos al lado y añádelos.
              </p>
            ) : (
              <ul className="assigned-list vac-scroll">
                {assigned.map((c) => (
                  <li key={c.id} className="assigned-row">
                    <span className="avatar">{initials(c.full_name)}</span>
                    <div className="assigned-row__info">
                      <div className="assigned-row__name">
                        {c.full_name || "(sin nombre)"}
                      </div>
                      <div className="assigned-row__sub">{c.headline || c.email || "—"}</div>
                    </div>
                    <span className={"badge st-" + c.stage}>{c.stage}</span>
                    <button className="btn-ghost btn-sm" onClick={() => unassign(c.id)}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <p className="card__title">Puntuar candidatos y añadir</p>
            <p className="card__intro">
              Compara tu base de candidatos con esta oferta y añade los que encajen.
            </p>
            <div className="actions">
              <button onClick={score} disabled={scoring || !description.trim()}>
                {scoring ? "Puntuando…" : "Puntuar candidatos"}
              </button>
            </div>
            {!description.trim() && (
              <p className="card__hint">
                Añade una descripción a la oferta (al lado) para poder puntuar.
              </p>
            )}

            {results && (
              <ul className="score-list vac-scroll">
                {results.map((r) => {
                  const already = assignedIds.has(r.id);
                  return (
                    <li key={r.id} className="score-row">
                      <span className={"fit-pill " + fitBand(r.fit)}>
                        {(r.fit * 100).toFixed(0)}%
                      </span>
                      <div className="score-row__info">
                        <div className="score-row__name">
                          {r.full_name || "(sin nombre)"}
                        </div>
                        <div className="score-row__sub">{r.headline || r.source_file || "—"}</div>
                      </div>
                      {already ? (
                        <span className="score-row__done">✓ Añadido</span>
                      ) : (
                        <button className="btn-sm" onClick={() => assign(r.id)}>
                          Añadir
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
