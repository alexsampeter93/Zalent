import { useEffect, useMemo, useState } from "react";
import { OlazSprite } from "../components/OlazSprite";
import { listCandidates, type CandidateRow } from "../lib/candidates";
import {
  listVacancies,
  listAllMemberships,
  stageDistribution,
  STAGES,
} from "../lib/vacancies";
import { reportError } from "../lib/errors";

// Color de cada fase (coherente con los badges y el kanban).
const STAGE_COLOR: Record<string, string> = {
  nuevo: "#f59e0b",
  entrevista: "#3b82f6",
  oferta: "#10b981",
  descartado: "#9ca3af",
};

export function Panel() {
  const [cands, setCands] = useState<CandidateRow[]>([]);
  const [offers, setOffers] = useState(0);
  const [assignments, setAssignments] = useState(0);
  const [stageCounts, setStageCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cs, vs, ms, dist] = await Promise.all([
          listCandidates(),
          listVacancies(),
          listAllMemberships(),
          stageDistribution(),
        ]);
        setCands(cs);
        setOffers(vs.length);
        setAssignments(ms.length);
        const m = new Map<string, number>();
        for (const s of STAGES) m.set(s.key, 0);
        for (const d of dist) m.set(d.stage, d.count);
        setStageCounts(m);
      } catch (e) {
        // Un panel de estadísticas que falla enseña ceros, y unos ceros son
        // indistinguibles de "no tienes datos".
        reportError("No se pudieron cargar las estadísticas del panel", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    let noName = 0;
    let noEmail = 0;
    for (const c of cands) {
      if (!c.full_name || !c.full_name.trim()) noName++;
      if (!c.email || !c.email.trim()) noEmail++;
    }
    const inProcess =
      (stageCounts.get("entrevista") ?? 0) + (stageCounts.get("oferta") ?? 0);
    const maxCount = Math.max(1, ...STAGES.map((s) => stageCounts.get(s.key) ?? 0));
    return { total: cands.length, noName, noEmail, inProcess, maxCount };
  }, [cands, stageCounts]);

  const kpis = [
    { label: "Candidatos", value: stats.total, color: null },
    { label: "Ofertas", value: offers, color: null },
    { label: "Asignaciones", value: assignments, color: null },
    { label: "En proceso", value: stats.inProcess, color: STAGE_COLOR.entrevista },
  ];

  return (
    <div className="screen screen--wide screen--fill">
      <div className="screen__head">
        <h1 className="screen__title">Panel</h1>
        <p className="screen__sub">Tu base de talento de un vistazo. Todo local.</p>
      </div>

      <div className="screen-scroll">
        {loading ? (
          <p className="screen__sub">Cargando…</p>
        ) : stats.total === 0 ? (
          <div className="card">
            <p className="card__intro">
              Aún no hay candidatos. Ve a Importar para añadir CVs.
            </p>
          </div>
        ) : (
          <>
            {/* Fila de KPIs */}
            <div className="kpi-row">
              {kpis.map((k) => (
                <div className="kpi" key={k.label}>
                  <div className="kpi__value">{k.value}</div>
                  <div className="kpi__label">
                    {k.color && (
                      <span className="kpi__dot" style={{ background: k.color }} />
                    )}
                    {k.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Distribución por fase (sumando todas las ofertas) */}
            <div className="panel-card">
              <h2 className="panel-card__title">Fases del pipeline</h2>
              {assignments === 0 ? (
                <p className="card__intro">
                  Aún no has asignado candidatos a ninguna oferta. Hazlo desde
                  Vacantes para ver aquí el reparto por fase.
                </p>
              ) : (
                <div className="dist">
                  {STAGES.map((s) => {
                    const n = stageCounts.get(s.key) ?? 0;
                    const pct = assignments > 0 ? (n / assignments) * 100 : 0;
                    const width = (n / stats.maxCount) * 100;
                    return (
                      <div className="dist__row" key={s.key}>
                        <div className="dist__name">{s.label}</div>
                        <div className="dist__track">
                          <div
                            className="dist__bar"
                            style={{
                              width: `${width}%`,
                              background: STAGE_COLOR[s.key],
                            }}
                          />
                        </div>
                        <div className="dist__val">
                          <strong>{n}</strong>
                          <span>{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Calidad de los datos */}
            <div className="panel-card">
              <h2 className="panel-card__title">Calidad de los datos</h2>
              <div className="quality">
                <div className="quality__item">
                  <span className="quality__n">{stats.noName}</span>
                  <span className="quality__lbl">sin nombre detectado</span>
                </div>
                <div className="quality__item">
                  <span className="quality__n">{stats.noEmail}</span>
                  <span className="quality__lbl">sin email</span>
                </div>
              </div>
              {(stats.noName > 0 || stats.noEmail > 0) && (
                <p className="quality__hint">
                  Puedes revisar esos CVs abriendo el original desde su ficha.
                </p>
              )}
            </div>

            <div className="panel-mascot">
              {/* Olaz saltando y tirando los CVs al aire: es la pantalla de
                  "míralo todo hecho", así que aquí celebra. Se anima al pasar
                  el ratón, no sola — en un panel de datos, algo moviéndose sin
                  parar distrae de los números, que es a lo que se viene. */}
              <OlazSprite
                name="olaz-jump"
                frames={5}
                sequence={[1, 2, 3, 4, 4, 5, 5, 1]}
                fps={11}
                height={165}
                playOn="hover"
                alt="Olaz celebrando"
              />
              <p>Todo tu talento, ordenado y en tu equipo.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
