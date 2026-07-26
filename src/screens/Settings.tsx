import { useState, type ReactNode } from "react";
import { PrivacySection } from "./settings/PrivacySection";
import { SecuritySection } from "./settings/SecuritySection";
import { SearchAiSection } from "./settings/SearchAiSection";
import { DataSection } from "./settings/DataSection";
import { AppearanceSection } from "./settings/AppearanceSection";
import { SoundSection } from "./settings/SoundSection";
import { AboutSection } from "./settings/AboutSection";

// Ajustes = un menú lateral de secciones + el panel de la sección activa. Cada
// sección vive en su propio fichero (screens/settings/), como se hizo con
// App.tsx: aquí solo queda la navegación. Ver Diario 57 / M1.
type Section =
  | "apariencia"
  | "sonido"
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
  sonido: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />
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
  { key: "sonido", title: "Sonido", desc: "Avisos sonoros de la interfaz (apagados de fábrica)." },
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
            {section === "sonido" && <SoundSection />}
            {section === "acerca" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
