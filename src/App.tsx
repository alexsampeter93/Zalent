import { useEffect, useState } from "react";
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
import "./App.css";

// App es el ORQUESTADOR: enruta entre pantallas y sostiene el estado de nivel
// app (pantalla activa, bloqueo). La lógica de cada pantalla vive en su hook
// (useCandidates, useImport) o su componente. useCandidates es además la fuente
// de datos central: Importar refresca la lista al importar y Ajustes al borrar.
function App() {
  const [screen, setScreen] = useState<Screen>("candidatos");
  // Bloqueo: null = comprobando, true = bloqueada, false = abierta.
  const [locked, setLocked] = useState<boolean | null>(null);

  const cand = useCandidates({ active: screen === "candidatos" });
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
  if (locked === null) return null;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;

  return (
    <AppShell active={screen} onNavigate={setScreen}>
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
        />
      )}

      {screen === "vacantes" && <Vacancies />}
      {screen === "pipeline" && <Pipeline />}
      {screen === "panel" && <Panel />}
      {screen === "ajustes" && <Settings onWiped={cand.refreshAll} />}
    </AppShell>
  );
}

export default App;
