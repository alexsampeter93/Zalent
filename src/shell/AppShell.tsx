import { type ReactNode } from "react";
import "./shell.css";
import { useThemeMode, resolvedTheme } from "../lib/theme";

export type Screen =
  | "candidatos"
  | "importar"
  | "vacantes"
  | "pipeline"
  | "panel"
  | "ajustes";

const NAV: { key: Screen; label: string; group: string; icon: ReactNode }[] = [
  {
    key: "candidatos",
    label: "Candidatos",
    group: "Trabajo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /><path d="M17 3.13a4 4 0 0 1 0 7.75" /></svg>
    ),
  },
  {
    key: "importar",
    label: "Importar",
    group: "Trabajo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /></svg>
    ),
  },
  {
    key: "vacantes",
    label: "Vacantes",
    group: "Trabajo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>
    ),
  },
  {
    key: "pipeline",
    label: "Pipeline",
    group: "Trabajo",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="18" rx="1" /><rect x="10" y="3" width="6" height="12" rx="1" /><rect x="17" y="3" width="4" height="8" rx="1" /></svg>
    ),
  },
  {
    key: "panel",
    label: "Panel",
    group: "Analizar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
    ),
  },
  {
    key: "ajustes",
    label: "Ajustes",
    group: "Analizar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 8" /></svg>
    ),
  },
];

export function AppShell({
  active,
  onNavigate,
  children,
}: {
  active: Screen;
  onNavigate: (s: Screen) => void;
  children: ReactNode;
}) {
  const [mode, setThemeMode] = useThemeMode();
  const dark = resolvedTheme(mode) === "dark";
  let lastGroup = "";
  return (
    <div className="app">
      <aside className="rail">
        <div className="rail__hero">
          <div className="coco-beam" />
          <div className="coco-glow" />
          <img className="coco-logo" src="/olaz/olaz-avatar-zalent.png" alt="Olaz, la mascota de Zalent" />
        </div>
        <div className="rail__name">Zalent</div>
        <div className="rail__tag">Talento local-first</div>

        <nav>
          {NAV.map((item) => {
            const header =
              item.group !== lastGroup ? (
                <div key={item.group} className="rail__section">
                  {item.group}
                </div>
              ) : null;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {header}
                <button
                  className={"nav-item" + (active === item.key ? " active" : "")}
                  onClick={() => onNavigate(item.key)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div className="rail__foot">
          <button
            className="theme-toggle"
            onClick={() => setThemeMode(dark ? "light" : "dark")}
          >
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
            <span>{dark ? "Modo claro" : "Modo oscuro"}</span>
          </button>
          <div className="privacy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <span>
              <b>Datos en tu equipo.</b> Nada sale a la nube.
            </span>
          </div>
        </div>
      </aside>

      <div className="content">{children}</div>
    </div>
  );
}

// Pantalla "próximamente" con Olaz, para las secciones aún por construir.
export function ComingSoon({
  title,
  pose = "thinking",
}: {
  title: string;
  pose?: "thinking" | "sleeping" | "magnifier";
}) {
  const src = `/olaz/coco-${pose === "magnifier" ? "magnifier-cv" : pose === "sleeping" ? "sleeping-cv" : "thinking-cv"}.png`;
  return (
    <div className="screen">
      <div className="coming">
        <img src={src} alt="Olaz" />
        <h3>{title}</h3>
        <p>Esta sección llegará en una fase próxima.</p>
      </div>
    </div>
  );
}
