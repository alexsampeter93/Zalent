// Clasificación automática "por señales": lee el texto del CV y detecta
// datos UNIVERSALES (no dependientes de industria): idiomas, carnets,
// años de experiencia y nivel de estudios. Devuelve etiquetas sugeridas.
//
// Es gratis y 100% local (solo reglas sobre el texto). No pretende decir
// "esto es un enfermero" (eso es trabajo de un LLM): detecta señales fiables.

// Quita acentos y pasa a minúsculas para poder buscar sin fallos.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Idiomas: nombre del idioma → etiqueta. (Patrones ya sin acentos.)
const LANGUAGES: [RegExp, string][] = [
  [/\bingles\b|\benglish\b/, "Inglés"],
  [/\bfrances\b|\bfrench\b/, "Francés"],
  [/\baleman\b|\bgerman\b|\bdeutsch\b/, "Alemán"],
  [/\bitaliano\b/, "Italiano"],
  [/\bportugues\b/, "Portugués"],
  [/\bchino\b|\bmandarin\b/, "Chino"],
  [/\barabe\b/, "Árabe"],
  [/\bcatalan\b/, "Catalán"],
  [/\bgallego\b/, "Gallego"],
  [/\beuskera\b|\bvasco\b/, "Euskera"],
];

// Nivel de estudios, de mayor a menor (nos quedamos con el más alto).
const STUDIES: [RegExp, string][] = [
  [/\bdoctorad|\bphd\b/, "Doctorado"],
  [/\bmaster\b|\bmba\b|\bposgrad|\bpostgrad/, "Máster"],
  [/\bgrado\b|\blicenciatur|\bingenier|\bdiplomat|\buniversi|\barquitectur/, "Universitarios"],
  [/\bformacion profesional|\bgrado medio|\bgrado superior|\bfp\b|\btecnico superior/, "FP"],
  [/\bbachillerat/, "Bachillerato"],
  [/\beso\b|\beducacion secundaria|\bgraduado escolar/, "ESO"],
];

function experienceTag(years: number | null): string | null {
  if (years == null || years < 1) return null;
  if (years < 3) return "1-3 años exp";
  if (years < 5) return "3-5 años exp";
  if (years < 10) return "5-10 años exp";
  return "10+ años exp";
}

export function suggestTags(rawText: string, years: number | null): string[] {
  const t = normalize(rawText || "");
  const tags = new Set<string>();

  // Idiomas
  for (const [re, label] of LANGUAGES) {
    if (re.test(t)) tags.add(label);
  }

  // Carnets / permisos
  if (/\bc\s*\+\s*e\b/.test(t)) tags.add("Carnet C+E");
  if (/\badr\b/.test(t)) tags.add("ADR");
  if (/\bcarretill/.test(t)) tags.add("Carretillero");
  if (
    /\b(carnet|carne|permiso|licencia)\b[^.]{0,20}\bconduc/.test(t) ||
    /\bconduc[^.]{0,20}\b(carnet|carne|permiso|licencia)\b/.test(t) ||
    /\b(carnet|permiso)\s+[a-e]\d?\b/.test(t)
  ) {
    tags.add("Carné de conducir");
  }

  // Estudios (solo el nivel más alto detectado)
  for (const [re, label] of STUDIES) {
    if (re.test(t)) {
      tags.add("Estudios: " + label);
      break;
    }
  }

  // Experiencia (a partir del campo estructurado, si lo hay)
  const exp = experienceTag(years);
  if (exp) tags.add(exp);

  return [...tags];
}
