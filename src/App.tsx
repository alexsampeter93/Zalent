import { useEffect, useState, type ReactNode } from "react";
import { AppShell, type Screen } from "./shell/AppShell";
import { Settings } from "./screens/Settings";
import { LockScreen } from "./screens/LockScreen";
import { hasMasterPassword } from "./lib/lock";
import { Vacancies } from "./screens/Vacancies";
import { Pipeline } from "./screens/Pipeline";
import { Panel } from "./screens/Panel";
import { useImport } from "./screens/import/useImport";
import { ImportScreen } from "./screens/import/ImportScreen";
import { useCandidates } from "./screens/candidates/useCandidates";
import { CandidatesScreen } from "./screens/candidates/CandidatesScreen";
import { ErrorToasts } from "./components/ErrorToasts";
import { Onboarding } from "./screens/Onboarding";
import { hasSeenOnboarding } from "./lib/onboarding";
import { BrandSplash } from "./components/BrandSplash";
import "./App.css";

// App es el ORQUESTADOR: enruta entre pantallas y sostiene el estado de nivel
// app (pantalla activa, bloqueo). La lógica de cada pantalla vive en su hook
// (useCandidates, useImport) o su componente. useCandidates es además la fuente
// de datos central: Importar refresca la lista al importar y Ajustes al borrar.
function App() {
  const [screen, setScreen] = useState<Screen>("candidatos");
  // Bloqueo: null = comprobando, true = bloqueada, false = abierta.
  const [locked, setLocked] = useState<boolean | null>(null);
  // Onboarding: se lee de localStorage al arrancar (init perezoso, sin efecto),
  // y solo se muestra una vez tras desbloquear.
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  // "CocoBrain presenta", cada arranque. Se superpone a lo que haya debajo
  // (candado/onboarding/app) — no retrasa nada, solo lo tapa un instante.
  const [showSplash, setShowSplash] = useState(true);

  // ready=false mientras se comprueba el bloqueo O mientras está bloqueada:
  // useCandidates no debe tocar la BD hasta que sepamos que se puede abrir.
  const cand = useCandidates({ active: screen === "candidatos", ready: locked === false });
  const imp = useImport({
    active: screen === "importar",
    onImported: cand.refreshAll,
  });

  // ¿Hay contraseña maestra? Si la hay, la app arranca bloqueada.
  useEffect(() => {
    hasMasterPassword()
      .then((has) => setLocked(has))
      .catch(() => setLocked(false));
  }, []);

  // Bloqueo: mientras comprobamos no pintamos nada; si está bloqueada, el candado.
  // Primer arranque: el onboarding va DESPUÉS de desbloquear (si no, se vería
  // antes que la contraseña). Al terminar, lleva a Importar, que es el paso
  // natural siguiente.
  let body: ReactNode;
  if (locked === null) {
    body = null;
  } else if (locked) {
    body = <LockScreen onUnlock={() => setLocked(false)} />;
  } else if (showOnboarding) {
    body = (
      <Onboarding
        onDone={() => {
          setShowOnboarding(false);
          setScreen("importar");
        }}
      />
    );
  } else {
    body = (
      <AppShell active={screen} onNavigate={setScreen}>
        {/* Los avisos de error viven aquí, fuera de las pantallas: un fallo al
            cargar candidatos tiene que verse aunque hayas navegado a otro sitio,
            y así ninguna pantalla necesita saber cómo se muestra un error. */}
        <ErrorToasts />

        {screen === "candidatos" && (
          <CandidatesScreen
            cand={cand}
            onNavigateToImport={() => setScreen("importar")}
          />
        )}

        {screen === "importar" && (
          <ImportScreen
            imp={imp}
            unclassifiedCount={cand.unclassifiedCount}
            onAutoClassify={cand.onAutoClassify}
            classifying={cand.classifying}
            onNavigateToSettings={() => setScreen("ajustes")}
          />
        )}

        {screen === "vacantes" && <Vacancies />}
        {screen === "pipeline" && <Pipeline />}
        {screen === "panel" && <Panel />}
        {screen === "ajustes" && <Settings onWiped={cand.refreshAll} />}
      </AppShell>
    );
  }

  return (
    <>
      {showSplash && <BrandSplash onDone={() => setShowSplash(false)} />}
      {body}
    </>
  );
}

export default App;
