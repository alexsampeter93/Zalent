import { useEffect, useState } from "react";

// Tema de la app: claro, oscuro o "sistema" (sigue al sistema operativo).
// Compartido entre el menú lateral y Ajustes vía localStorage + un evento.

export type ThemeMode = "light" | "dark" | "system";

const KEY = "zalent-theme";

export function getMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

// Qué tema real se ve (resuelve "system" mirando la preferencia del SO).
export function resolvedTheme(mode: ThemeMode = getMode()): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

export function applyMode(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", resolvedTheme(mode));
}

export function setMode(mode: ThemeMode): void {
  localStorage.setItem(KEY, mode);
  applyMode(mode);
  window.dispatchEvent(new CustomEvent("zalent-theme-change", { detail: mode }));
}

// Hook reactivo: se sincroniza entre componentes (evento) y con el SO.
export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const [mode, setModeState] = useState<ThemeMode>(getMode);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    const onChange = (e: Event) =>
      setModeState((e as CustomEvent).detail as ThemeMode);
    window.addEventListener("zalent-theme-change", onChange);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSys = () => {
      if (getMode() === "system") applyMode("system");
    };
    mq.addEventListener("change", onSys);
    return () => {
      window.removeEventListener("zalent-theme-change", onChange);
      mq.removeEventListener("change", onSys);
    };
  }, []);

  const set = (m: ThemeMode) => {
    setMode(m);
    setModeState(m);
  };
  return [mode, set];
}
