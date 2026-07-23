// Evalúa si el texto que sacamos de un CV es de fiar. Un producto profesional
// FALLA EN VOZ ALTA: si de un CV apenas se leyó texto, o salió fragmentado
// (plantillas con las letras muy espaciadas: "V E G O"), hay que avisar al
// usuario en vez de importar una ficha medio vacía como si todo hubiera ido
// bien. Ver Diario 60 / A2.

export type ExtractionIssue = "empty" | "fragmented" | null;

export interface ExtractionQuality {
  ok: boolean;
  issue: ExtractionIssue;
  message: string; // vacío si ok
}

const OK: ExtractionQuality = { ok: true, issue: null, message: "" };

// Un "token de una sola letra/dígito" tras quitar signos. En una plantilla con
// letras espaciadas, casi todo el texto son estos. En un CV normal, muy pocos.
function isSingleChar(token: string): boolean {
  return token.replace(/[^\p{L}\p{N}]/gu, "").length === 1;
}

export function assessExtraction(text: string): ExtractionQuality {
  const t = (text || "").trim();

  // 1) Casi sin texto: típico de un PDF escaneado / imagen (sin OCR aún).
  if (t.length < 30) {
    return {
      ok: false,
      issue: "empty",
      message:
        "Apenas se pudo leer texto de este archivo. Si es un PDF escaneado o una foto, la app todavía no lee ese formato — la ficha se guardará casi vacía.",
    };
  }

  // 2) Texto fragmentado: muchas "palabras" de una sola letra. Ocurre con
  //    plantillas de CV que separan cada letra con un espacio ("V E G O"), y
  //    hace que la búsqueda por esas palabras no funcione (no existe "VEGO",
  //    existe "V E G O"). Umbral prudente para no marcar CVs normales.
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 20) {
    const single = tokens.filter(isSingleChar).length;
    if (single / tokens.length > 0.4) {
      return {
        ok: false,
        issue: "fragmented",
        message:
          "El texto de este CV se ha leído fragmentado (parece una plantilla con las letras muy espaciadas). Buscar por esas palabras puede no encontrarlo. Mejor un CV con texto normal.",
      };
    }
  }

  return OK;
}
