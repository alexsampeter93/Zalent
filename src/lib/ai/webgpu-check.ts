// PRUEBA TEMPORAL (spike): ¿funciona WebGPU dentro de la ventana de Tauri?
//
// De la respuesta depende si podemos meter un LLM local para rellenar fichas:
//   - Con GPU  → ~segundos por CV → producto viable.
//   - Sin GPU  → ~decenas de segundos por CV → inviable con 200 CVs.
//
// Probamos con el modelo que YA está cacheado (MiniLM, el de la búsqueda),
// para no descargar 1 GB solo para averiguarlo. Si MiniLM corre por WebGPU,
// la fontanería (navegador → GPU → transformers.js) funciona.
//
// Este fichero es desechable: si el resultado es negativo, se borra entero.

import { pipeline, env } from "@huggingface/transformers";

const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export interface WebGpuReport {
  hasNavigatorGpu: boolean; // ¿existe la API en este webview?
  adapter: string; // qué GPU ve (o por qué no)
  gpuOk: boolean; // ¿ha completado una inferencia real por GPU?
  gpuMs: number | null; // cuánto tardó por GPU
  cpuMs: number | null; // cuánto tardó por CPU (referencia)
  speedup: string; // cuántas veces más rápida la GPU
  error: string; // el fallo, si lo hubo
}

// Texto de prueba: largo-ish, para que el tiempo sea representativo de un CV
// y no del arranque en vacío.
const SAMPLE = (
  "Técnico de mantenimiento industrial con experiencia en instalaciones " +
  "eléctricas, soldadura y lectura de planos. Carné de conducir B. " +
  "Inglés nivel intermedio. Disponibilidad para viajar."
).repeat(4);

export async function checkWebGpu(
  onStep?: (s: string) => void,
): Promise<WebGpuReport> {
  const report: WebGpuReport = {
    hasNavigatorGpu: false,
    adapter: "—",
    gpuOk: false,
    gpuMs: null,
    cpuMs: null,
    speedup: "—",
    error: "",
  };

  // Paso 1: ¿existe siquiera la API WebGPU en este webview?
  const gpu = (navigator as unknown as { gpu?: unknown }).gpu;
  report.hasNavigatorGpu = gpu != null;
  if (!report.hasNavigatorGpu) {
    report.error = "navigator.gpu no existe: este webview no expone WebGPU.";
    return report;
  }

  // Paso 2: ¿nos da el sistema un adaptador (una GPU real) de verdad?
  onStep?.("Pidiendo adaptador de GPU…");
  try {
    const g = gpu as {
      requestAdapter: () => Promise<Record<string, unknown> | null>;
    };
    const adapter = await g.requestAdapter();
    if (!adapter) {
      report.error = "WebGPU existe pero no hay adaptador (sin GPU utilizable).";
      return report;
    }
    // `info` es lo moderno; algunas versiones aún exponen `requestAdapterInfo`.
    const info = adapter.info as Record<string, string> | undefined;
    report.adapter = info
      ? [info.vendor, info.architecture, info.description]
          .filter(Boolean)
          .join(" · ") || "adaptador disponible"
      : "adaptador disponible";
  } catch (e) {
    report.error = "Error pidiendo adaptador: " + String(e);
    return report;
  }

  // Paso 3: la prueba que importa — una inferencia REAL por GPU.
  // Que exista la API no garantiza que transformers.js consiga usarla.
  env.allowLocalModels = false;
  try {
    onStep?.("Cargando el modelo en la GPU…");
    const gpuPipe = await pipeline("feature-extraction", MODEL, {
      device: "webgpu",
    });
    onStep?.("Midiendo GPU…");
    await gpuPipe(SAMPLE, { pooling: "mean", normalize: true }); // calentamiento
    const t0 = performance.now();
    await gpuPipe(SAMPLE, { pooling: "mean", normalize: true });
    report.gpuMs = Math.round(performance.now() - t0);
    report.gpuOk = true;
  } catch (e) {
    report.error = "La inferencia por WebGPU falló: " + String(e);
    return report;
  }

  // Paso 4: referencia por CPU, para saber CUÁNTO gana la GPU. Sin esto,
  // un "funciona" no dice nada: lo que decide es la diferencia.
  try {
    onStep?.("Midiendo CPU (referencia)…");
    const cpuPipe = await pipeline("feature-extraction", MODEL, {
      device: "wasm",
    });
    await cpuPipe(SAMPLE, { pooling: "mean", normalize: true });
    const t0 = performance.now();
    await cpuPipe(SAMPLE, { pooling: "mean", normalize: true });
    report.cpuMs = Math.round(performance.now() - t0);
  } catch {
    // Si la CPU falla no invalida la prueba: lo importante ya lo sabemos.
  }

  if (report.gpuMs && report.cpuMs) {
    report.speedup = (report.cpuMs / report.gpuMs).toFixed(1) + "× más rápida";
  }
  return report;
}
