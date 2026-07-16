// Puente con Ollama (el sidecar de IA generativa local).
//
// Fíjate en lo poco que hay aquí: la interfaz NO sabe qué es Ollama, ni que
// hay HTTP, ni que existe el puerto 11435. Solo invoca dos comandos. Toda la
// suciedad del mundo exterior vive en Rust (src-tauri/src/lib.rs).
//
// Eso es el principio hexagonal en la práctica: si mañana cambiamos Ollama
// por otra cosa, este fichero cambia de tripas pero nadie más se entera.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { validateExtraction, type ExtractedFields } from "./llm-validate";

// El modelo que usa Zalent. NO viaja en el instalador (ni MSI ni NSIS admiten
// ficheros de +2 GB y este pesa 4,68 GB): se descarga la primera vez que el
// usuario enciende la IA. Un solo sitio para cambiarlo.
export const AI_MODEL = "qwen2.5:7b";

export interface OllamaStatus {
  running: boolean;
  models: string[];
  error: string;
}

export function ollamaStatus(): Promise<OllamaStatus> {
  return invoke<OllamaStatus>("ollama_status");
}

// ¿Está el modelo ya descargado y listo para usar?
export async function isModelReady(): Promise<boolean> {
  try {
    const s = await ollamaStatus();
    return s.running && s.models.includes(AI_MODEL);
  } catch {
    return false;
  }
}

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
  done: boolean;
  error: string;
}

// Descarga el modelo (~4,7 GB), informando del progreso. Rust va emitiendo
// eventos según baja; aquí solo los escuchamos y los pasamos a la interfaz.
export async function pullModel(
  onProgress: (p: PullProgress) => void,
): Promise<void> {
  const un = await listen<PullProgress>("ollama-pull", (e) => onProgress(e.payload));
  try {
    await invoke("ollama_pull", { model: AI_MODEL });
  } finally {
    un(); // dejar de escuchar pase lo que pase, o se acumularían listeners
  }
}

export interface OllamaResult {
  ms: number;
  raw: string;
  parsed: Record<string, unknown> | null;
  fields: ExtractedFields | null;
  rejected: string[];
  error: string;
}

export async function ollamaExtract(
  model: string,
  cvText: string,
): Promise<OllamaResult> {
  const res = await invoke<{ raw: string; ms: number; error: string }>(
    "ollama_extract",
    { model, cvText },
  );

  const out: OllamaResult = {
    ms: res.ms,
    raw: res.raw,
    parsed: null,
    fields: null,
    rejected: [],
    error: res.error,
  };
  if (res.error || !res.raw) return out;

  try {
    // Con el esquema de Ollama esto debería parsear siempre; lo envolvemos
    // igual, porque "debería" no es "lo hace".
    out.parsed = JSON.parse(res.raw);
  } catch {
    out.error = "El JSON no parsea (pese al esquema).";
    return out;
  }

  // Mismo validador que con transformers.js: el anclaje NO depende de quién
  // extrajo. El modelo cambia; la desconfianza se queda.
  const { fields, report } = validateExtraction(out.parsed, cvText);
  out.fields = fields;
  out.rejected = report.rejected;
  return out;
}
