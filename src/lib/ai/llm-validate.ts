// EL VALIDADOR: la red de seguridad entre el LLM y la ficha.
//
// Regla de oro: al LLM no se le cree. Propone; este módulo dispone.
//
// La técnica central se llama ANCLAJE (grounding): un dato solo se acepta si
// APARECE DE VERDAD EN EL TEXTO DEL CV. Si el modelo dice que el candidato
// vive en Madrid pero "Madrid" no está escrito en ninguna parte del CV, se
// tira. No discutimos con el modelo: lo comprobamos contra la fuente.
//
// Esto es lo que impide que una alucinación acabe en la ficha de una persona
// real. Sin esta capa, el LLM mete basura con cara de seguridad (visto en la
// prueba: "165 años de experiencia").

import { normalize } from "./classify";

// La ficha ya limpia. Todo puede ser null: preferimos un hueco a una mentira.
export interface ExtractedFields {
  full_name: string | null;
  location: string | null;
  last_position: string | null;
  years_experience: number | null;
  education: string | null;
  skills: string[];
  languages: string[];
}

// Informe de lo que se ha descartado y por qué. No es decorativo: es cómo
// sabemos si el modelo es fiable o si hay que cambiarlo.
export interface ValidationReport {
  rejected: string[];
}

// ¿Aparece este valor, tal cual, en el CV? Comparamos normalizado (sin
// acentos ni mayúsculas) porque el modelo suele recapitalizar.
function appearsIn(value: string, text: string): boolean {
  return normalize(text).includes(normalize(value));
}

// Versión indulgente para campos que el modelo REFORMULA legítimamente
// (un puesto, un título). Exigimos que la mayoría de sus palabras con
// contenido estén en el CV; así "Licenciada en Fisioterapia" pasa aunque el
// CV ponga "Licenciatura en Fisioterapia".
function mostWordsAppearIn(value: string, text: string): boolean {
  const haystack = normalize(text);
  const words = normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3); // fuera preposiciones y ruido
  if (words.length === 0) return false;
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits / words.length >= 0.6;
}

// El modelo devuelve lo que le da la gana: string, número, lista, o una lista
// de objetos ({name, degree}). Lo aplanamos todo a texto plano.
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join(", ");
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(" — ");
  }
  return "";
}

// Los modelos pequeños se inventan el nombre de las claves: pides `full_name`
// y te dan `fullName`, `name` o `nombre`, aunque les enseñes el ejemplo exacto.
// En vez de pelearnos, aceptamos los alias conocidos. Comparamos sin guiones
// bajos ni mayúsculas, así `full_name` == `fullName` == `FullName`.
const ALIASES: Record<keyof ExtractedFields, string[]> = {
  full_name: ["full_name", "fullname", "name", "nombre"],
  location: ["location", "city", "ubicacion", "ciudad"],
  last_position: ["last_position", "lastposition", "position", "role", "title", "puesto"],
  years_experience: ["years_experience", "yearsexperience", "experienceyears", "years", "experience", "anos"],
  education: ["education", "studies", "degree", "estudios"],
  skills: ["skills", "habilidades", "competencias"],
  languages: ["languages", "idiomas"],
};

// Busca un campo probando todos sus alias.
function pick(raw: Record<string, unknown>, field: keyof ExtractedFields): unknown {
  const flat = new Map<string, unknown>();
  for (const [k, v] of Object.entries(raw)) {
    flat.set(k.toLowerCase().replace(/[_\s-]/g, ""), v);
  }
  for (const alias of ALIASES[field]) {
    const v = flat.get(alias.replace(/[_\s-]/g, ""));
    if (v != null) return v;
  }
  return null;
}

// Quita duplicados ignorando mayúsculas/acentos (el modelo repite en bucle).
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = normalize(item);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function toList(v: unknown): string[] {
  const arr = Array.isArray(v) ? v.map(toText) : toText(v).split(/[,;]/);
  return dedupe(
    arr.map((s) => s.trim()).filter((s) => s.length >= 2 && s.length <= 40),
  ).slice(0, 15);
}

// Valida la propuesta del LLM contra el CV original.
export function validateExtraction(
  raw: Record<string, unknown> | null,
  cvText: string,
): { fields: ExtractedFields; report: ValidationReport } {
  const rejected: string[] = [];
  const fields: ExtractedFields = {
    full_name: null,
    location: null,
    last_position: null,
    years_experience: null,
    education: null,
    skills: [],
    languages: [],
  };
  if (!raw) return { fields, report: { rejected: ["respuesta no parseable"] } };

  // --- Nombre: anclaje ESTRICTO. Un nombre inventado es lo más grave que
  // puede pasar en una ficha de una persona real.
  const name = toText(pick(raw, "full_name"));
  if (name && name.length <= 60) {
    if (appearsIn(name, cvText)) fields.full_name = name;
    else rejected.push(`full_name "${name}" (no aparece en el CV)`);
  }

  // --- Ubicación: anclaje ESTRICTO. Es un dato objetivo: o está o no está.
  const loc = toText(pick(raw, "location"));
  if (loc && loc.length <= 60) {
    if (appearsIn(loc, cvText)) fields.location = loc;
    else rejected.push(`location "${loc}" (no aparece en el CV)`);
  }

  // --- Puesto: anclaje INDULGENTE (el modelo lo reformula con razón).
  const pos = toText(pick(raw, "last_position"));
  if (pos && pos.length <= 80) {
    if (mostWordsAppearIn(pos, cvText)) fields.last_position = pos;
    else rejected.push(`last_position "${pos}" (no encaja con el CV)`);
  }

  // --- Estudios: anclaje INDULGENTE.
  const edu = toText(pick(raw, "education"));
  if (edu && edu.length <= 200) {
    if (mostWordsAppearIn(edu, cvText)) fields.education = edu;
    else rejected.push(`education "${edu}" (no encaja con el CV)`);
  }

  // --- Años: LÍMITES DE SENSATEZ. Aquí es donde muere el "165".
  const yearsRaw = pick(raw, "years_experience");
  const years = typeof yearsRaw === "number" ? yearsRaw : Number(toText(yearsRaw));
  if (Number.isFinite(years) && years >= 1 && years <= 50) {
    fields.years_experience = Math.round(years);
  } else if (yearsRaw != null && toText(yearsRaw) !== "") {
    rejected.push(`years_experience "${toText(yearsRaw)}" (fuera de rango 1-50)`);
  }

  // --- Skills e idiomas: cada uno anclado por separado. Es donde más
  // "rellena el hueco" un modelo pequeño (te pone Python porque suena bien).
  for (const s of toList(pick(raw, "skills"))) {
    if (appearsIn(s, cvText)) fields.skills.push(s);
    else rejected.push(`skill "${s}" (no aparece en el CV)`);
  }
  for (const l of toList(pick(raw, "languages"))) {
    if (appearsIn(l, cvText)) fields.languages.push(l);
    else rejected.push(`idioma "${l}" (no aparece en el CV)`);
  }

  return { fields, report: { rejected } };
}
