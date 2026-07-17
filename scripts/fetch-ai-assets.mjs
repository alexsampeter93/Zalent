// Coloca los assets de IA del FRONTEND que no se versionan por tamaño (~168 MB):
//   - El runtime WASM de onnxruntime-web  -> public/ort/
//   - El modelo de embeddings MiniLM (q8) -> public/models/...
//
// Por qué no van en git: pesan mucho y son regenerables (el patrón es el mismo
// que con el sidecar de Ollama, ver src-tauri/.gitignore). Pero SÍ tienen que
// estar presentes para compilar el instalador: así la app funciona 100%
// offline desde el primer arranque, sin depender de huggingface.co ni jsdelivr.
//
// Uso:  node scripts/fetch-ai-assets.mjs
// (se ejecuta solo antes de build/dev vía el script "prebuild" de package.json)

import { existsSync, mkdirSync, copyFileSync, createWriteStream, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- 1) WASM de onnxruntime-web: se COPIA de node_modules (ya instalado) ---
const ORT_SRC = join(root, "node_modules", "onnxruntime-web", "dist");
const ORT_DST = join(root, "public", "ort");
// El build WEB de transformers.js usa las variantes `asyncify` y la base
// (NO `jsep` — ese .mjs viene en el paquete pero el build web no lo carga;
// comprobado leyendo transformers.web.js). onnxruntime pide el fichero por su
// nombre exacto desde wasmPaths=/ort/, así que estos son los que deben estar.
const ORT_FILES = [
  "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
];

function copyWasm() {
  mkdirSync(ORT_DST, { recursive: true });
  for (const f of ORT_FILES) {
    const dst = join(ORT_DST, f);
    if (existsSync(dst)) {
      console.log(`  ya está: ort/${f}`);
      continue;
    }
    copyFileSync(join(ORT_SRC, f), dst);
    console.log(`  copiado: ort/${f}`);
  }
}

// --- 2) Modelo MiniLM: se DESCARGA de HuggingFace (una vez) ---
const HF = "https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main";
const MODEL_DST = join(root, "public", "models", "Xenova", "paraphrase-multilingual-MiniLM-L12-v2");
const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "unigram.json",
  "onnx/model_quantized.onnx", // el grande (~113 MB)
];

async function download(url, dst) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} al bajar ${url}`);
  mkdirSync(dirname(dst), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = createWriteStream(dst);
    Readable.fromWeb(res.body).pipe(out).on("finish", resolve).on("error", reject);
  });
}

async function fetchModel() {
  for (const f of MODEL_FILES) {
    const dst = join(MODEL_DST, f);
    if (existsSync(dst) && statSync(dst).size > 0) {
      console.log(`  ya está: models/.../${f}`);
      continue;
    }
    process.stdout.write(`  bajando: models/.../${f} ... `);
    await download(`${HF}/${f}`, dst);
    console.log("ok");
  }
}

console.log("Assets de IA del frontend:");
copyWasm();
await fetchModel();
console.log("Listo. La app puede correr offline (modelo + WASM en public/).");
