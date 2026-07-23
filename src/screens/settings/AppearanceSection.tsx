import { useThemeMode, type ThemeMode } from "../../lib/theme";
import { resetOnboarding } from "../../lib/onboarding";

// ---------- Apariencia ----------
export function AppearanceSection() {
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

      <p className="card__title" style={{ marginTop: 22 }}>
        Introducción
      </p>
      <p className="card__intro">
        La presentación de bienvenida que viste al abrir Zalent por primera vez.
      </p>
      <div className="actions">
        <button
          className="btn-secondary"
          onClick={() => {
            // Borra la marca y recarga: al volver a arrancar, el onboarding se
            // muestra otra vez (lo controla App con hasSeenOnboarding).
            resetOnboarding();
            window.location.reload();
          }}
        >
          Ver la introducción otra vez
        </button>
      </div>
    </section>
  );
}
