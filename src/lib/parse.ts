// Extractores heurísticos: sacan de forma fiable los campos "fáciles"
// (email, teléfono, enlace) y hacen una CONJETURA del nombre. Todo es
// editable después por el recruiter: la máquina propone, el humano decide.
// Más adelante, la IA (Fase 2+) mejorará estas conjeturas.

import {
  normalize,
  detectLanguages,
  detectStudies,
  detectYears,
} from "./ai/classify";

// Todos los campos son STRING porque alimentan directamente el formulario de
// revisión (el recruiter los edita antes de guardar).
export interface GuessedFields {
  full_name: string;
  email: string;
  phone: string;
  links: string;
  location: string;
  education: string;
  years_experience: string;
  languages: string; // separados por comas
  skills: string; // separados por comas
}

export function guessFields(text: string, fileName?: string): GuessedFields {
  // Texto normalizado (minúsculas, sin acentos) para los detectores.
  const t = normalize(text || "");
  // Nombre: primero por el texto (si empieza con "Nombre Apellido"); si no,
  // por el nombre del archivo (muchos CVs se llaman "CV Nombre Apellido").
  const full_name = guessName(text) || nameFromFilename(fileName);
  const years = detectYears(t);
  return {
    full_name,
    email: matchEmail(text),
    phone: matchPhone(text),
    links: matchLink(text),
    location: detectLocation(text, t),
    education: detectStudies(t) ?? "",
    years_experience: years != null ? String(years) : "",
    languages: detectLanguages(t).join(", "),
    skills: detectSkills(text).join(", "),
  };
}

// Provincias y ciudades españolas (normalizadas, sin acentos). Es geografía,
// no una taxonomía de sector: no rompe el principio industria-agnóstica.
// Las de varias palabras van primero, para que ganen sobre las cortas.
const PLACES = [
  "santiago de compostela", "alcala de henares", "san sebastian", "a coruna",
  "ciudad real", "las palmas", "la rioja", "santa cruz de tenerife",
  "madrid", "barcelona", "valencia", "sevilla", "zaragoza", "malaga", "murcia",
  "bilbao", "vigo", "gijon", "vitoria", "pontevedra", "ourense", "lugo",
  "alicante", "almeria", "asturias", "avila", "badajoz", "burgos", "caceres",
  "cadiz", "cantabria", "castellon", "cordoba", "cuenca", "girona", "granada",
  "guadalajara", "guipuzcoa", "huelva", "huesca", "jaen", "leon", "lleida",
  "navarra", "palencia", "salamanca", "segovia", "soria", "tarragona",
  "teruel", "toledo", "valladolid", "vizcaya", "zamora", "albacete", "alava",
  "palma", "ceuta", "melilla",
];

// Ubicación: primero una etiqueta explícita ("Ubicación: X"); si no, la
// primera provincia/ciudad conocida que aparezca.
function detectLocation(original: string, t: string): string {
  const m = original.match(
    /(?:ubicaci[oó]n|localidad|residencia|direcci[oó]n|ciudad|municipio)\s*[:\-]\s*([^\n,;|]{2,40})/i,
  );
  if (m) return m[1].trim();
  for (const p of PLACES) {
    if (new RegExp(`\\b${p}\\b`).test(t)) return titleCase(p);
  }
  return "";
}

// Skills: buscamos una SECCIÓN de habilidades y troceamos su contenido.
// Es heurístico (los CVs son un caos), pero la máquina propone y tú decides.
function detectSkills(original: string): string[] {
  const m = original.match(
    /(?:habilidades|competencias|conocimientos|aptitudes|skills)\s*[:\n]([\s\S]{0,300})/i,
  );
  if (!m) return [];
  // Cortamos al llegar a un doble salto o a un titular en MAYÚSCULAS.
  const block = m[1].split(/\n\s*\n|\n(?=[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{3,}\n)/)[0];
  return block
    .split(/[•·▪|,;\n\t]+/)
    .map((s) => s.replace(/^[\s\-–—*]+/, "").trim())
    .filter(
      (s) => s.length >= 2 && s.length <= 32 && /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(s),
    )
    .slice(0, 10);
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Extrae un nombre del NOMBRE DEL ARCHIVO: quita extensión, separadores,
// números y palabras tipo "CV"/"curriculum", y deja las primeras palabras.
function nameFromFilename(fileName?: string): string {
  if (!fileName) return "";
  const stop = new Set([
    "cv", "curriculum", "vitae", "resume", "resumen", "final", "def", "actualizado",
  ]);
  const cleaned = fileName
    .replace(/\.[^.]+$/, "") // extensión
    .replace(/[_\-().]+/g, " ") // separadores → espacio
    .replace(/\d+/g, " "); // números fuera
  const words = cleaned
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stop.has(w.toLowerCase()))
    .filter((w) => /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü'.-]+$/.test(w))
    .slice(0, 4);
  return words.length >= 2 ? titleCase(words.join(" ")) : "";
}

function matchEmail(text: string): string {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : "";
}

function matchLink(text: string): string {
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/\S+/i);
  if (linkedin) return linkedin[0];
  const url = text.match(/https?:\/\/\S+/i);
  return url ? url[0] : "";
}

function matchPhone(text: string): string {
  // Busca secuencias que parezcan un teléfono y valida por nº de dígitos.
  const candidates = text.match(/\+?\d[\d\s().-]{7,}\d/g) ?? [];
  for (const c of candidates) {
    const digits = c.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) return c.trim();
  }
  return "";
}

function guessName(text: string): string {
  // Heurística: el nombre suele ir al principio. Cogemos los primeros
  // tokens "Con Mayúscula inicial pero no TODO mayúsculas" y paramos al
  // llegar a un título en mayúsculas (p.ej. "PROGRAMADOR").
  const tokens = text.trim().split(/\s+/).slice(0, 6);
  const name: string[] = [];
  for (const t of tokens) {
    if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'.-]+$/.test(t)) name.push(t);
    else break;
  }
  return name.slice(0, 4).join(" ");
}
