// Clasificación automática "por señales": lee el texto del CV y detecta
// datos UNIVERSALES (no dependientes de industria): idiomas, carnets,
// años de experiencia y nivel de estudios. Devuelve etiquetas sugeridas.
//
// Es gratis y 100% local (solo reglas sobre el texto). No pretende decir
// "esto es un enfermero" (eso es trabajo de un LLM): detecta señales fiables.

// Quita acentos y pasa a minúsculas para poder buscar sin fallos.
export function normalize(s: string): string {
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

// ----- Detectores reutilizables (los usan las etiquetas Y la ficha) -----
// `t` debe venir ya normalizado (minúsculas, sin acentos).

export function detectLanguages(t: string): string[] {
  return LANGUAGES.filter(([re]) => re.test(t)).map(([, label]) => label);
}

// Devuelve el nivel de estudios MÁS ALTO detectado, o null.
export function detectStudies(t: string): string | null {
  for (const [re, label] of STUDIES) if (re.test(t)) return label;
  return null;
}

export function detectLicenses(t: string): string[] {
  const out: string[] = [];
  if (/\bc\s*\+\s*e\b/.test(t)) out.push("Carnet C+E");
  if (/\badr\b/.test(t)) out.push("ADR");
  if (/\bcarretill/.test(t)) out.push("Carretillero");
  if (
    /\b(carnet|carne|permiso|licencia)\b[^.]{0,20}\bconduc/.test(t) ||
    /\bconduc[^.]{0,20}\b(carnet|carne|permiso|licencia)\b/.test(t) ||
    /\b(carnet|permiso)\s+[a-e]\d?\b/.test(t)
  ) {
    out.push("Carné de conducir");
  }
  return out;
}

const CURRENT_YEAR = new Date().getFullYear();

// Intenta quedarse SOLO con la sección de experiencia (si el CV la tiene),
// para no contar como experiencia los años de los estudios. Si no la
// encuentra, devuelve todo el texto.
function experienceSlice(t: string): string {
  const start = t.search(/\bexperiencia\b/);
  if (start === -1) return t;
  const rest = t.slice(start);
  const endRel = rest.search(
    /\b(formacion|educacion|estudios|habilidades|competencias|idiomas|certificaciones)\b/,
  );
  return endRel > 40 ? rest.slice(0, endRel) : rest;
}

// Suma los años a partir de RANGOS DE FECHAS ("2019 - 2023", "2019 - actualidad").
// Fusiona los solapamientos para no contar dos veces el mismo periodo.
function yearsFromRanges(t: string): number | null {
  const re =
    /((?:19|20)\d{2})\s*(?:[-–—]|\ba\b|\bhasta\b)\s*((?:19|20)\d{2}|actualidad|presente|actual|hoy)/g;
  const intervals: [number, number][] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const start = Number(m[1]);
    const end = /^\d{4}$/.test(m[2]) ? Number(m[2]) : CURRENT_YEAR;
    if (start >= 1950 && end >= start && end <= CURRENT_YEAR + 1) {
      intervals.push([start, end]);
    }
  }
  if (intervals.length === 0) return null;

  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[intervals[0][0], intervals[0][1]]];
  for (const [s, e] of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e); // se solapan → se funden
    else merged.push([s, e]);
  }
  const total = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  return total >= 1 && total <= 50 ? total : null;
}

// Años de experiencia: 1º la frase literal ("5 años de experiencia");
// si no, se calculan desde los rangos de fechas (como los escriben los CVs).
export function detectYears(t: string): number | null {
  const m =
    t.match(/(\d{1,2})\s*\+?\s*anos?\s+de\s+experiencia/) ||
    t.match(/experiencia\s+(?:laboral\s+)?(?:de\s+)?(?:mas\s+de\s+)?(\d{1,2})\s*anos?/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 50) return n;
  }
  return yearsFromRanges(experienceSlice(t));
}

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

  for (const l of detectLanguages(t)) tags.add(l);
  for (const l of detectLicenses(t)) tags.add(l);

  const studies = detectStudies(t);
  if (studies) tags.add("Estudios: " + studies);

  // Experiencia: del campo estructurado si lo hay; si no, del texto.
  const exp = experienceTag(years ?? detectYears(t));
  if (exp) tags.add(exp);

  return [...tags];
}
