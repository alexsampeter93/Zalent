import { useEffect, useMemo, useState } from "react";
import { listCandidates, STATUSES, type CandidateRow } from "../lib/candidates";

// Color de cada estado (coherente con los badges y el kanban).
const STATUS_COLOR: Record<string, string> = {
  nuevo: "#f59e0b",
  entrevista: "#3b82f6",
  oferta: "#10b981",
  descartado: "#9ca3af",
};

export function Panel() {
  const [cands, setCands] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setCands(await listCandidates());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Todas las cuentas se calculan en local desde la lista real.
  const stats = useMemo(() => {
    const total = cands.length;
    const byStatus = new Map<string, number>();
    for (const s of STATUSES) byStatus.set(s.key, 0);
    let noName = 0;
    let noEmail = 0;
    for (const c of cands) {
      const key = c.status || "nuevo";
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
      if (!c.full_name || !c.full_name.trim()) noName++;
      if (!c.email || !c.email.trim()) noEmail++;
    }
    const inProcess =
      (byStatus.get("entrevista") ?? 0) + (byStatus.get("oferta") ?? 0);
    const maxCount = Math.max(1, ...STATUSES.map((s) => byStatus.get(s.key) ?? 0));
    return { total, byStatus, inProcess, maxCount, noName, noEmail };
  }, [cands]);

  const kpis = [
    { label: "Candidatos", value: stats.total, color: null },
    { label: "Nuevos", value: stats.byStatus.get("nuevo") ?? 0, color: STATUS_COLOR.nuevo },
    { label: "En proceso", value: stats.inProcess, color: STATUS_COLOR.entrevista },
    { label: "Descartados", value: stats.byStatus.get("descartado") ?? 0, color: STATUS_COLOR.descartado },
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

            {/* Distribución por estado */}
            <div className="panel-card">
              <h2 className="panel-card__title">Distribución por estado</h2>
              <div className="dist">
                {STATUSES.map((s) => {
                  const n = stats.byStatus.get(s.key) ?? 0;
                  const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
                  const width = (n / stats.maxCount) * 100;
                  return (
                    <div className="dist__row" key={s.key}>
                      <div className="dist__name">{s.label}</div>
                      <div className="dist__track">
                        <div
                          className="dist__bar"
                          style={{
                            width: `${width}%`,
                            background: STATUS_COLOR[s.key],
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
          </>
        )}
      </div>
    </div>
  );
}
