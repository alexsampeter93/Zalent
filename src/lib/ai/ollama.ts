// Puente con Ollama (el sidecar de IA generativa local).
//
// Fíjate en lo poco que hay aquí: la interfaz NO sabe qué es Ollama, ni que
// hay HTTP, ni que existe el puerto 11435. Solo invoca dos comandos. Toda la
// suciedad del mundo exterior vive en Rust (src-tauri/src/lib.rs).
//
// Eso es el principio hexagonal en la práctica: si mañana cambiamos Ollama
// por otra cosa, este fichero cambia de tripas pero nadie más se entera.

import { invoke } from "@tauri-apps/api/core";
import { validateExtraction, type ExtractedFields } from "./llm-validate";

export interface OllamaStatus {
  running: boolean;
  models: string[];
  error: string;
}

export function ollamaStatus(): Promise<OllamaStatus> {
  return invoke<OllamaStatus>("ollama_status");
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
