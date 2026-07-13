import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// Permitimos descargar el modelo del hub la primera vez; luego queda cacheado
// en local (offline a partir de entonces).
env.allowLocalModels = false;

// Modelo de embeddings MULTILINGÜE (entiende español) y pequeño. Convierte
// texto en un vector de 384 números que representa su "significado".
const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// Carga (y cachea) el modelo una sola vez. El callback informa del progreso
// de descarga la primera vez.
export function getExtractor(
  onProgress?: (info: unknown) => void,
): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL, {
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
