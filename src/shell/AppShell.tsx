import { useEffect, useRef, useState, type ReactNode } from "react";
import "./shell.css";
import { useThemeMode, resolvedTheme } from "../lib/theme";

// El Olaz del menú va rotando sus animaciones EN ORDEN — parpadeo, saludo,
// gafas — y cada una se reproduce UNA vez, limpia, ida y vuelta al reposo.
// Entre una y otra hay una pausa corta en la pose de reposo (frame 1).
//
// Todo se dibuja con UN SOLO <img> cuyo `src` va cambiando entre frames ya
// precargados. Antes se alternaba entre un <img> del avatar y un componente
// aparte: cada cambio de elemento provocaba un "destello negro" (el navegador
// recargaba la imagen y por un instante se veía el fondo oscuro). Con un solo
// elemento y todo precargado, no hay recarga: no hay destello.
type MenuAnim = { name: string; frames: number; seq: number[]; fps: number };

const MENU_ANIMS: MenuAnim[] = [
  // parpadeo: abre-medio-cierra-medio-abre, una vez
  { name: "olaz-blink", frames: 3, seq: [1, 2, 3, 2, 1], fps: 12 },
  // saludo: sube el brazo, saluda, lo baja. Pausado para que se lea con calma.
  { name: "olaz-wave", frames: 4, seq: [1, 2, 3, 4, 3, 4, 2, 1], fps: 7 },
  // gafas: se resbalan, sube el dedo, las recoloca
  { name: "olaz-glasses", frames: 4, seq: [1, 2, 3, 4, 1], fps: 8 },
];

// Pausa en reposo entre una animación y la siguiente (ms).
const IDLE_MIN = 2200;
const IDLE_MAX = 4500;
const REST = "/olaz/frames/olaz-blink-01.png"; // pose de reposo (ojos abiertos)

export type Screen =
  | "candidatos"
  | "importar"
  | "vacantes"
  | "pipeline"
  | "panel"
  | "ajustes";

// Todas las rutas de frames que el menú puede mostrar (para precargarlas).
const ALL_MENU_FRAMES = MENU_ANIMS.flatMap((a) =>
  Array.from({ length: a.frames }, (_, i) => `/olaz/frames/${a.name}-${String(i + 1).padStart(2, "0")}.png`),
);

function MenuOlaz() {
  const [src, setSrc] = useState(REST);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Precargar TODO antes de animar: sin esto, el primer paso por cada frame
    // llegaría sin decodificar y parpadearía.
    ALL_MENU_FRAMES.forEach((s) => { const im = new Image(); im.src = s; });

    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(() => { if (alive) fn(); }, ms));
    };

    let animIdx = 0;
    const playNext = () => {
      if (!alive || reduced) return;
      const a = MENU_ANIMS[animIdx % MENU_ANIMS.length];
      animIdx++;
      const step = 1000 / a.fps;
      // reproducir la secuencia, frame a frame
      a.seq.forEach((f, i) => {
        at(i * step, () => setSrc(`/olaz/frames/${a.name}-${String(f).padStart(2, "0")}.png`));
      });
      // al terminar: volver al reposo y programar la siguiente tras la pausa
      const total = a.seq.length * step;
      at(total, () => setSrc(REST));
      at(total + IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN), playNext);
    };

    // primer arranque tras una pausa corta
    at(IDLE_MIN, playNext);
    return () => {
      alive = false;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <img
      className="coco-logo"
      src={src}
      alt="Olaz, la mascota de Zalent"
      draggable={false}
    />
  );
}

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
          <MenuOlaz />
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
