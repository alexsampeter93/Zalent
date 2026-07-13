// Extractores heurísticos: sacan de forma fiable los campos "fáciles"
// (email, teléfono, enlace) y hacen una CONJETURA del nombre. Todo es
// editable después por el recruiter: la máquina propone, el humano decide.
// Más adelante, la IA (Fase 2+) mejorará estas conjeturas.

export interface GuessedFields {
  full_name: string;
  email: string;
  phone: string;
  links: string;
}

export function guessFields(text: string, fileName?: string): GuessedFields {
  // Nombre: primero por el texto (si empieza con "Nombre Apellido"); si no,
  // por el nombre del archivo (muchos CVs se llaman "CV Nombre Apellido").
  const full_name = guessName(text) || nameFromFilename(fileName);
  return {
    full_name,
    email: matchEmail(text),
    phone: matchPhone(text),
    links: matchLink(text),
  };
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
