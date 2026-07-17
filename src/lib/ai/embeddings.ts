import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// OFFLINE TOTAL: ni el modelo ni el runtime salen a internet. Antes se
// descargaban de huggingface.co (modelo) y cdn.jsdelivr.net (WASM) la primera
// vez; ahora ambos viajan EMPOTRADOS en la app (public/models y public/ort) y
// se cargan del propio origen. Esto es lo que permite la CSP estricta
// `connect-src 'self'` (nada sale del equipo) y que la búsqueda funcione sin
// red desde el primer arranque. Ver Diario, entrada 35.
env.allowLocalModels = true; // buscar el modelo en local…
env.allowRemoteModels = false; // …y NUNCA en el hub remoto.
env.localModelPath = "/models/"; // servido desde public/models/ (mismo origen)
// El runtime ONNX (WASM) también local, no desde el CDN de jsdelivr.
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/";

// Modelo de embeddings MULTILINGÜE (entiende español) y pequeño. Convierte
// texto en un vector de 384 números que representa su "significado".
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// Carga (y cachea) el modelo una sola vez. Fijamos `dtype: "q8"` a propósito:
// es el que corresponde al `model_quantized.onnx` que embebemos, así lo que se
// pide y lo que viaja en la app SIEMPRE coinciden (no dependemos del valor por
// defecto de la librería, que podría cambiar entre versiones).
export function getExtractor(
  onProgress?: (info: unknown) => void,
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: onProgress,
    });
  }
  return extractorPromise;
}

// Convierte un texto en su vector de significado (normalizado).
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return output.data as Float32Array;
}

// Similitud coseno entre dos vectores. Como están normalizados, basta el
// producto escalar. Devuelve ~1 (muy parecidos) … ~0 (nada que ver).
export function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
