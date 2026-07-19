import { useSyncExternalStore } from "react";
import {
  currentErrors,
  dismissError,
  subscribeErrors,
  type AppError,
} from "../lib/errors";

// El sitio donde se ven los errores que antes solo iban a la consola.
//
// No desaparecen solos a los pocos segundos, a propósito: si algo no se ha
// guardado, el usuario tiene que poder leerlo aunque estuviera mirando a otro
// lado. Se cierran a mano, uno a uno.
//
// `useSyncExternalStore` es la forma que da React de leer de un almacén que
// vive fuera de React. Frente a un `useEffect` que suscribe y hace `setState`,
// evita el render de más (y el aviso de ESLint que lo señala).
export function ErrorToasts() {
  const errors = useSyncExternalStore(subscribeErrors, currentErrors);
  if (errors.length === 0) return null;

  return (
    <div className="toasts" role="region" aria-label="Errores">
      {errors.map((e) => (
        <ErrorToast key={e.id} error={e} />
      ))}
    </div>
  );
}

function ErrorToast({ error }: { error: AppError }) {
  return (
    // `alert` hace que un lector de pantalla lo lea en cuanto aparece, sin que
    // el usuario tenga que ir a buscarlo.
    <div className="toast" role="alert">
      <div className="toast__body">
        <p className="toast__title">{error.message}</p>
        {/* El detalle técnico existe pero no molesta: plegado hasta que alguien
            lo necesite para contar qué ha pasado. */}
        <details className="toast__detail">
          <summary>Detalles</summary>
          <code>{error.detail}</code>
        </details>
      </div>
      <button
        className="toast__close"
        onClick={() => dismissError(error.id)}
        aria-label="Cerrar aviso"
      >
        ✕
      </button>
    </div>
  );
}
