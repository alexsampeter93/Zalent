import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";

// OCR de PDFs escaneados (imágenes sin texto seleccionable). Es el ÚLTIMO
// recurso: solo se usa cuando pdf.js apenas sacó texto (ver extract.ts). Corre
// 100% local con tesseract.js; el motor y los datos de idioma (spa+eng) viven
// en public/tesseract/ (los coloca scripts/fetch-ai-assets.mjs), así que no
// sale nada a la red — coherente con el local-first. Ver Diario 60 / A3.
//
// Es LENTO (varios segundos por página por CPU), por eso se limita a las
// primeras páginas: un CV cabe de sobra, y evita que un PDF enorme cuelgue todo.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_OCR_PAGES = 5;
const RENDER_SCALE = 2; // 2x: más resolución = OCR más fiable

export async function ocrPdf(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // Rutas locales: así el worker, el core WASM y los .traineddata se cargan de
  // public/tesseract/ y no de una CDN (que la CSP bloquearía).
  const worker = await createWorker(["spa", "eng"], 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract",
    langPath: "/tesseract",
  });

  try {
    const pages: string[] = [];
    const n = Math.min(pdf.numPages, MAX_OCR_PAGES);
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const { data: res } = await worker.recognize(canvas);
      pages.push(res.text);
    }
    return pages.join("\n\n").trim();
  } finally {
    await worker.terminate();
  }
}
