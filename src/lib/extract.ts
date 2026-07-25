import mammoth from "mammoth/mammoth.browser";
import JSZip from "jszip";
import { extractPdfText } from "./pdf";
import { assessExtraction } from "./extract-quality";
import { reportError } from "./errors";

// Texto de los CUADROS DE TEXTO de un .docx. mammoth solo lee el cuerpo normal
// y se deja fuera los cuadros de texto (muy usados en plantillas de CV con
// diseño): su contenido vive en `word/document.xml` dentro de `<w:txbxContent>`.
// Lo sacamos aparte y se añade al cuerpo, para no perder esa información.
async function extractDocxTextBoxes(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const doc = zip.file("word/document.xml");
    if (!doc) return "";
    const xml = await doc.async("string");
    const boxes = xml.match(/<w:txbxContent[\s\S]*?<\/w:txbxContent>/g);
    if (!boxes) return "";
    const runs: string[] = [];
    for (const box of boxes) {
      for (const m of box.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)) {
        const t = m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        if (t) runs.push(t);
      }
    }
    return runs.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    // Si algo falla al leer los cuadros, no rompemos la importación: nos
    // quedamos con lo que sacó mammoth del cuerpo.
    return "";
  }
}

// Extractor unificado: elige el motor según el formato del archivo.
// Hoy: PDF (pdf.js) y Word .docx (mammoth + cuadros de texto). Mañana: OCR.
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const text = await extractPdfText(file);
    // Si el PDF se leyó mal (casi sin texto o fragmentado), casi seguro es un
    // ESCANEADO (una imagen sin texto seleccionable). Ahí tiramos de OCR como
    // último recurso. Se carga tesseract solo en ese momento (import dinámico),
    // para no meter su peso en el arranque cuando no hace falta. Ver A3 / Diario 60.
    if (!assessExtraction(text).ok) {
      try {
        const { ocrPdf } = await import("./ocr");
        const ocrText = await ocrPdf(file);
        if (ocrText.trim().length > text.trim().length) return ocrText;
      } catch (e) {
        // El OCR falló: no rompemos la importación (devolvemos lo que había),
        // pero lo AVISAMOS en pantalla en vez de tragarlo, para poder verlo.
        reportError("El OCR del PDF escaneado falló", e);
      }
    }
    return text;
  }

  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const body = (await mammoth.extractRawText({ arrayBuffer })).value;
    const boxes = await extractDocxTextBoxes(arrayBuffer);
    return [body, boxes].filter(Boolean).join("\n").trim();
  }

  // Nota: el Word antiguo (.doc, formato binario) no está soportado; solo .docx.
  throw new Error(
    "Formato no soportado. Usa PDF o Word moderno (.docx). El .doc antiguo no vale.",
  );
}
