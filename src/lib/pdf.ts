import * as pdfjsLib from "pdfjs-dist";
// Vite empaqueta el "worker" de pdf.js como un archivo aparte y nos da su URL.
// pdf.js hace el trabajo pesado en ese worker (un hilo separado) para no
// congelar la interfaz mientras lee PDFs grandes.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Extrae todo el texto de un PDF, página a página.
export async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Cada "item" es un fragmento de texto; los unimos con espacios.
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(pageText);
  }

  // Separamos las páginas con una línea en blanco.
  return pages.join("\n\n").trim();
}
