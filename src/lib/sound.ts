import { useEffect, useState } from "react";
import { play, setEnabled } from "cuelume";

// Sonidos de interfaz. Sigue el mismo patrón que `theme.ts`: la preferencia
// vive en localStorage (es de ESTA instalación, no un dato de negocio) y se
// comparte entre componentes con un evento.
//
// Dos decisiones de producto que conviene no revertir sin pensarlo:
//
// 1. APAGADO de fábrica. Zalent se usa en una oficina; un portátil que hace
//    "ding" a cada clic delante de compañeros pasa de encantador a molesto
//    muy rápido. Quien los quiera, los enciende.
// 2. La app NUNCA nombra sonidos de la librería directamente, sino MOMENTOS
//    ("desbloqueado", "importación terminada"). Así el día que se cambie de
//    librería —o se quiera otro sonido para un momento— se toca solo este
//    fichero. Es el mismo aislamiento que se aplicó a la IA en `lib/ai/`.

export type SoundLevel = "off" | "key" | "full";

const KEY = "zalent-sound";

// Los momentos de la app, y qué sonido de la paleta les toca.
// `key`  → avisos con significado (algo terminó, algo falló).
// `full` → además, la interfaz responde al tocarla.
const CUES = {
  unlocked: { sound: "success", level: "key" },
  denied: { sound: "error", level: "key" },
  imported: { sound: "ready", level: "key" },
  failed: { sound: "error", level: "key" },
  tap: { sound: "press", level: "full" },
  hover: { sound: "whisper", level: "full" },
  toggle: { sound: "toggle", level: "full" },
} as const;

export type Cue = keyof typeof CUES;

// Fuera del navegador (los tests de `lib/` corren en Node) no hay
// localStorage ni audio. Este módulo lo llama `errors.ts`, que a propósito NO
// depende del navegador, así que aquí se degrada a silencio en vez de
// petar — lo cazaron los tests al añadir el aviso sonoro a `reportError`.
const hasDom = typeof window !== "undefined" && typeof localStorage !== "undefined";

export function getSoundLevel(): SoundLevel {
  if (!hasDom) return "off";
  const v = localStorage.getItem(KEY);
  if (v === "off" || v === "key" || v === "full") return v;
  return "off"; // ver decisión 1
}

/** Reproduce el sonido de un MOMENTO, si el nivel actual lo incluye. */
export function cue(name: Cue): void {
  const level = getSoundLevel();
  if (level === "off") return;
  const c = CUES[name];
  if (c.level === "full" && level !== "full") return;
  play(c.sound);
}

export function setSoundLevel(level: SoundLevel): void {
  if (!hasDom) return;
  localStorage.setItem(KEY, level);
  // Doble cierre: además de nuestro filtro, se silencia la propia librería.
  setEnabled(level !== "off");
  wireGlobalCues(level === "full");
  window.dispatchEvent(new CustomEvent("zalent-sound-change", { detail: level }));
}

// --- Clics y hover de toda la interfaz ---
//
// Se resuelve con DOS oyentes delegados en `document`, no tocando los ~70
// botones de la app: menos código, y ningún componente tiene que acordarse
// de sonar. Solo suenan elementos accionables (botón/enlace/pestaña), nunca
// el fondo o un texto suelto.
const ACTIONABLE = 'button, a[href], [role="button"], [role="tab"], summary';
const HOVER_GAP_MS = 140; // sin esto, barrer el menú con el ratón es metralla
let lastHover = 0;
let wired = false;

function onPointerDown(e: Event) {
  const el = e.target instanceof Element ? e.target.closest(ACTIONABLE) : null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  cue("tap");
}

function onPointerOver(e: Event) {
  const pe = e as PointerEvent;
  // Solo ratón fino: en pantalla táctil "pasar por encima" no existe.
  if (pe.pointerType && pe.pointerType !== "mouse") return;
  const el = e.target instanceof Element ? e.target.closest(ACTIONABLE) : null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const now = performance.now();
  if (now - lastHover < HOVER_GAP_MS) return;
  lastHover = now;
  cue("hover");
}

function wireGlobalCues(on: boolean): void {
  if (!hasDom || on === wired) return;
  wired = on;
  if (on) {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerover", onPointerOver, true);
  } else {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointerover", onPointerOver, true);
  }
}

/** Deja el motor de sonido acorde a la preferencia guardada. Se llama al arrancar. */
export function initSound(): void {
  if (!hasDom) return;
  const level = getSoundLevel();
  setEnabled(level !== "off");
  wireGlobalCues(level === "full");
}

/** Hook reactivo, para que Ajustes y el resto no se desincronicen. */
export function useSoundLevel(): [SoundLevel, (l: SoundLevel) => void] {
  const [level, setLevelState] = useState<SoundLevel>(getSoundLevel);

  useEffect(() => {
    const onChange = (e: Event) =>
      setLevelState((e as CustomEvent).detail as SoundLevel);
    window.addEventListener("zalent-sound-change", onChange);
    return () => window.removeEventListener("zalent-sound-change", onChange);
  }, []);

  const set = (l: SoundLevel) => {
    setSoundLevel(l);
    setLevelState(l);
  };
  return [level, set];
}
