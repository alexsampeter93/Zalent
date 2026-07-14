import { useEffect, useState } from "react";
import {
  listCandidates,
  updateCandidateStatus,
  STATUSES,
  type CandidateRow,
} from "../lib/candidates";

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function Pipeline() {
  const [cands, setCands] = useState<CandidateRow[]>([]);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  async function load() {
    try {
      setCands(await listCandidates());
    } catch (e) {
      console.error(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function move(id: number, status: string) {
    // Actualización optimista: movemos la tarjeta al instante, luego persistimos.
    setCands((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    try {
      await updateCandidateStatus(id, status);
    } catch (e) {
      console.error(e);
      load(); // si falla, recargamos el estado real
    }
  }

  function onDrop(status: string) {
    if (draggingId != null) {
      const c = cands.find((x) => x.id === draggingId);
      if (c && c.status !== status) move(draggingId, status);
    }
    setDraggingId(null);
    setOverCol(null);
  }

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Pipeline</h1>
        <p className="screen__sub">
          Arrastra las tarjetas entre columnas para mover a tus candidatos.
        </p>
      </div>

      <div className="kanban">
        {STATUSES.map((s) => {
          const col = cands.filter((c) => (c.status || "nuevo") === s.key);
          return (
            <div
              key={s.key}
              className={"kanban__col" + (overCol === s.key ? " is-over" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                if (overCol !== s.key) setOverCol(s.key);
              }}
              onDragLeave={(e) => {
                // solo limpiar si salimos de la columna, no de un hijo
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
    </div>
  );
}
