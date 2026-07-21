import type { CandidateDetail } from "../candidates";
import { ollamaGenerate, type GenerateResult } from "./ollama";

// Ayudas de IA GENERATIVA sobre la ficha de un candidato: resumen, preguntas de
// entrevista y borrador de email de rechazo.
//
// Todo lo que sale de aquí es un BORRADOR para revisar, nunca un dato para dar
// por cierto. A diferencia de la extracción (que copia del CV y valida contra
// él), esto reformula y redacta: el anclaje se pone en el PROMPT ("básate solo
// en el CV, no inventes"), no comprobando la salida. Ver Diario, entrada 51.

// Contexto del candidato en texto, para meterlo en el prompt. Se comparte entre
// las tres ayudas: todas parten de "quién es esta persona según su ficha".
//
// Se recorta el CV a 6000 caracteres, igual que en la extracción: más contexto
// cuesta tiempo de CPU y no mejora el resultado.
export function candidateContext(c: CandidateDetail): string {
  const parts: string[] = [];
  if (c.full_name) parts.push(`Nombre: ${c.full_name}`);
  if (c.headline) parts.push(`Puesto actual/último: ${c.headline}`);
  if (c.years_experience != null)
    parts.push(`Años de experiencia: ${c.years_experience}`);
  if (c.education) parts.push(`Estudios: ${c.education}`);
  if (c.skills.length > 0) parts.push(`Skills: ${c.skills.join(", ")}`);
  if (c.languages.length > 0) parts.push(`Idiomas: ${c.languages.join(", ")}`);
  if (c.raw_text)
    parts.push(`\nTexto completo del CV:\n${c.raw_text.slice(0, 6000)}`);
  return parts.join("\n");
}

// ---- Resumen del candidato ----
//
// El más arriesgado: un resumen que alucina experiencia parece un hecho. Por eso
// temperatura 0 (reproducible) y un system que insiste en ceñirse al CV.
const SUMMARY_SYSTEM =
  "Eres un asistente de selección de personal. Resumes el perfil de un " +
  "candidato de forma objetiva, breve y en español. Te basas ÚNICAMENTE en la " +
  "información de su ficha y su CV: si un dato no aparece, no lo mencionas ni " +
  "lo supones. No exageras ni valoras; solo resumes lo que hay. " +
  // Un LLM tiende a "regularizar" nombres propios poco frecuentes (una cadena
  // como VEGO Supermercados se le puede convertir en "supermercades"). No se
  // puede evitar del todo en algo generativo, pero insistir baja la frecuencia.
  // Ver Diario, entrada 53.
  "Copia los nombres propios (empresas, lugares, personas, títulos) EXACTAMENTE " +
  "como aparecen, letra por letra, sin corregirlos ni cambiarlos.";

export function summarizeCandidate(c: CandidateDetail): Promise<GenerateResult> {
  const prompt =
    "Resume este perfil en 3 o 4 frases, destacando su experiencia principal, " +
    "sus competencias y su formación. No inventes nada que no esté en la " +
    "ficha.\n\n" +
    candidateContext(c);
  return ollamaGenerate(SUMMARY_SYSTEM, prompt, 0);
}

// ---- Preguntas de entrevista ----
//
// Aquí alucinar importa poco: son SUGERENCIAS que el reclutador filtra. Un poco
// de temperatura da variedad sin desmadrarse.
const INTERVIEW_SYSTEM =
  "Eres un reclutador experto. Propones preguntas de entrevista concretas y " +
  "útiles, en español, adaptadas al perfil del candidato. Las preguntas deben " +
  "ayudar a comprobar su experiencia real y detectar huecos. Evitas preguntas " +
  "genéricas que servirían para cualquiera.";

export function interviewQuestions(c: CandidateDetail): Promise<GenerateResult> {
  const prompt =
    "Propón entre 5 y 7 preguntas de entrevista para este candidato, basadas " +
    "en su experiencia y su perfil. Devuelve solo la lista de preguntas, una " +
    "por línea, sin numerar.\n\n" +
    candidateContext(c);
  return ollamaGenerate(INTERVIEW_SYSTEM, prompt, 0.4);
}

// ---- Borrador de email de rechazo ----
//
// Delicado: va a una persona real. El system fija un tono amable y profesional
// y PROHÍBE dar motivos concretos (que pueden meter en un lío legal) o hacer
// promesas. Siempre se edita antes de enviar; Zalent no envía nada solo.
const REJECTION_SYSTEM =
  "Eres un profesional de RRHH que redacta comunicaciones a candidatos en " +
  "español. Escribes un email de rechazo amable, respetuoso y breve. NO das " +
  "motivos concretos del rechazo ni valoras negativamente al candidato. NO " +
  "prometes futuras oportunidades como algo seguro. Dejas huecos entre " +
  "corchetes para que la persona rellene lo que falte (por ejemplo, [nombre de " +
  "la empresa]).";

export function rejectionEmail(
  c: CandidateDetail,
  vacancyTitle?: string,
): Promise<GenerateResult> {
  const puesto = vacancyTitle ? ` para el puesto de "${vacancyTitle}"` : "";
  const prompt =
    `Redacta un email de rechazo amable y profesional para ${c.full_name ?? "el candidato"}` +
    `${puesto}. Agradece su interés y su tiempo, comunica que no se continúa ` +
    "con su candidatura y desea lo mejor. Máximo 6 frases.";
  return ollamaGenerate(REJECTION_SYSTEM, prompt, 0.3);
}
