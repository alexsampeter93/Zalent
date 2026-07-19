// Errores VISIBLES.
//
// El problema que resuelve: 36 de los 42 `catch` de la app hacían solo
// `console.error(e)`. Para el usuario eso significa que al pulsar un botón "no
// pasa nada" — la lista sale vacía, el borrado no ocurre, la etiqueta no
// aparece — y no hay forma de saber por qué. En una app de escritorio sin
// telemetría, un error que solo va a la consola es un error que nadie va a
// arreglar nunca: el usuario no abre las herramientas de desarrollo, así que ni
// siquiera puede contarte lo que pasó.
//
// La consola se mantiene (sigue siendo lo más cómodo al depurar), pero además
// el error sale por pantalla, con dos niveles: QUÉ intentaba hacer la app, en
// español, y el detalle técnico plegado para quien quiera copiarlo.
//
// Es un almacén externo a React, no un contexto: cualquier módulo puede avisar
// de un error sin ser un componente ni recibir props (`candidates.ts` no sabe
// que React existe, y así sigue siendo).

export interface AppError {
  id: number;
  // Qué estaba intentando hacer la app, contado al usuario.
  message: string;
  // Lo técnico, para copiar y pegar en un informe.
  detail: string;
}

type Listener = () => void;

let errors: AppError[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function emit() {
  for (const fn of listeners) fn();
}

// Convierte cualquier cosa lanzable en texto legible. En JavaScript se puede
// lanzar cualquier valor, y los comandos de Tauri rechazan con una cadena
// pelada, así que un `err.message` a secas se quedaría en "undefined".
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

// Avisa de un fallo. `message` describe la ACCIÓN que no salió, no el error:
// "No se pudieron cargar las ofertas", no "Error de SQL".
export function reportError(message: string, err: unknown): void {
  console.error(message, err);
  const detail = describeError(err);
  // Si el mismo fallo se repite (p.ej. un efecto que reintenta), no apilamos
  // diez avisos idénticos encima del usuario.
  if (errors.some((e) => e.message === message && e.detail === detail)) return;
  errors = [...errors, { id: nextId++, message, detail }];
  emit();
}

export function dismissError(id: number): void {
  errors = errors.filter((e) => e.id !== id);
  emit();
}

export function dismissAllErrors(): void {
  if (errors.length === 0) return;
  errors = [];
  emit();
}

// Para `useSyncExternalStore`: devuelve SIEMPRE la misma referencia mientras no
// haya cambios (si devolviera un array nuevo cada vez, React entraría en un
// bucle de renders).
export function currentErrors(): AppError[] {
  return errors;
}

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
