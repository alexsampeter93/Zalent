import mammoth from "mammoth/mammoth.browser";
import { extractPdfText } from "./pdf";

// Extractor unificado: elige el motor según el formato del archivo.
// Hoy: PDF (pdf.js) y Word .docx (mammoth). Mañana: imágenes con OCR.
export async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractPdfText(file);
  }

  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  }

  // Nota: el Word antiguo (.doc, formato binario) no está soportado; solo .docx.
  throw new Error(
    "Formato no soportado. Usa PDF o Word moderno (.docx). El .doc antiguo no vale.",
  );
}
