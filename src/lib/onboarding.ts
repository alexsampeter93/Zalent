// Recuerda si el usuario ya vio el primer arranque guiado. Vive en localStorage
// (no en la base de datos): es una preferencia de esta instalación, no un dato
// del negocio, y así no depende de que la BD esté abierta.

const SEEN_KEY = "zalent-onboarding-seen";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // si localStorage falla, no molestamos con el onboarding
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* sin persistencia: peor onboarding la próxima vez, no un fallo */
  }
}

// Olvida que se vio, para poder volver a mostrarlo (desde Ajustes).
export function resetOnboarding(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* nada que hacer */
  }
}
