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

import { existsSync, mkdirSync, copyFileSync, createWriteStream, statSync, readdirSync } from "node:fs";
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

// --- 3) OCR (tesseract.js) para PDFs escaneados ---
// El motor (worker + core wasm) se COPIA de node_modules; los datos de idioma
// (spa/eng) se DESCARGAN una vez. Todo a public/tesseract/ para que el OCR
// funcione 100% offline bajo la CSP (igual que MiniLM). Ver Diario 60 / A3.
const TESS_DST = join(root, "public", "tesseract");
const TESS_CORE_SRC = join(root, "node_modules", "tesseract.js-core");
const TESS_WORKER_SRC = join(root, "node_modules", "tesseract.js", "dist", "worker.min.js");
const TESSDATA = "https://tessdata.projectnaptha.com/4.0.0";
const TESS_LANGS = ["spa", "eng"];

function copyTesseractEngine() {
  mkdirSync(TESS_DST, { recursive: true });
  copyFileSync(TESS_WORKER_SRC, join(TESS_DST, "worker.min.js"));
  console.log("  copiado: tesseract/worker.min.js");
  // TODAS las variantes del core (simd, relaxedsimd, lstm, base…): tesseract
  // elige una según lo que soporte el navegador, y si falta la elegida el OCR
  // no arranca. Copiarlas todas evita adivinar (fue el bug: faltaban las
  // `relaxedsimd`, que es justo la que elige el WebView de Windows).
  for (const f of readdirSync(TESS_CORE_SRC)) {
    if (/^tesseract-core.*\.wasm(\.js)?$/.test(f)) {
      copyFileSync(join(TESS_CORE_SRC, f), join(TESS_DST, f));
      console.log(`  copiado: tesseract/${f}`);
    }
  }
}

async function fetchTessdata() {
  for (const lang of TESS_LANGS) {
    const dst = join(TESS_DST, `${lang}.traineddata.gz`);
    if (existsSync(dst) && statSync(dst).size > 0) {
      console.log(`  ya está: tesseract/${lang}.traineddata.gz`);
      continue;
    }
    process.stdout.write(`  bajando: tesseract/${lang}.traineddata.gz ... `);
    await download(`${TESSDATA}/${lang}.traineddata.gz`, dst);
    console.log("ok");
  }
}

console.log("Assets de IA del frontend:");
copyWasm();
await fetchModel();
copyTesseractEngine();
await fetchTessdata();
console.log("Listo. La app puede correr offline (modelo + WASM + OCR en public/).");
