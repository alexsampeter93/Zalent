import { getDb } from "../db";
import { embed, cosine } from "./embeddings";
import { computePreference, PREF_WEIGHT } from "./preference";

const MODEL_TAG = "minilm-multilingual-v1";

// Trocea un texto en fragmentos de ~60 palabras con solape, para que cada
// trozo entre en el modelo (~128 palabras) y sirva como "evidencia" legible.
const CHUNK_WORDS = 60;
const OVERLAP = 12;
const MAX_CHUNKS = 40; // tope por candidato, por si un CV es larguísimo

function chunkText(text: string): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= CHUNK_WORDS) return [words.join(" ")];

  const chunks: string[] = [];
  const step = CHUNK_WORDS - OVERLAP;
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + CHUNK_WORDS).join(" "));
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return chunks.slice(0, MAX_CHUNKS);
}

// Indexa por fragmentos los candidatos que aún no lo estén (para este modelo).
export async function indexAllCandidates(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const db = await getDb();
  const pending = await db.select<
    {
      id: number;
      full_name: string | null;
      headline: string | null;
      education: string | null;
      raw_text: string | null;
    }[]
  >(
    `SELECT c.id, c.full_name, c.headline, c.education, c.raw_text
       FROM candidates c
      WHERE NOT EXISTS (
        SELECT 1 FROM candidate_chunks ch
         WHERE ch.candidate_id = c.id AND ch.model = $1
      )`,
    [MODEL_TAG],
  );

  let done = 0;
  for (const c of pending) {
    // Ponemos delante nombre/titular/estudios para que salgan en el 1er trozo.
    const doc = [c.full_name, c.headline, c.education, c.raw_text]
      .filter(Boolean)
      .join(" \n ");
    const chunks = chunkText(doc);

    await db.execute(
      "DELETE FROM candidate_chunks WHERE candidate_id = $1 AND model = $2",
      [c.id, MODEL_TAG],
    );
    for (let i = 0; i < chunks.length; i++) {
      const vec = await embed(chunks[i]);
      await db.execute(
        `INSERT INTO candidate_chunks (candidate_id, idx, text, model, vector)
         VALUES ($1, $2, $3, $4, $5)`,
        [c.id, i, chunks[i], MODEL_TAG, JSON.stringify(Array.from(vec))],
      );
    }
    done++;
    onProgress?.(done, pending.length);
  }
  return pending.length;
}

// Reconstruye el índice desde cero: borra los fragmentos y reindexa todo.
// (Mantenimiento: útil si algo se desincroniza.)
export async function reindexAll(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const db = await getDb();
  await db.execute("DELETE FROM candidate_chunks WHERE model = $1", [MODEL_TAG]);
  return indexAllCandidates(onProgress);
}

export interface SearchHit {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  source_file: string | null;
  score: number; // encaje combinado 0..1 (significado + coincidencia exacta)
  evidence: string; // el fragmento del CV que respalda el encaje
  matched: string[]; // términos de la búsqueda que coinciden LITERALMENTE
  why: string; // razones estructuradas del encaje (no LLM)
}

// Palabras vacías: muy comunes, aportan poco a la coincidencia léxica.
export const STOPWORDS = new Set([
  "con", "para", "los", "las", "del", "una", "uno", "que", "por", "como",
  "sus", "sobre", "entre", "experiencia", "anos", "perfil", "trabajo",
]);

// Normaliza: minúsculas, sin acentos, solo letras/números y espacios.
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(query: string): string[] {
  return Array.from(
    new Set(
      norm(query)
        .split(" ")
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
    ),
  );
}

// Umbral: por debajo de este coseno, dos textos solo comparten el "ruido de
// fondo" (ser CVs en español). Lo usamos para calibrar el % de encaje.
const SEM_FLOOR = 0.3;
const SEM_TOP = 0.75;

// Búsqueda HÍBRIDA. El % de "encaje" combina, calibrado a 0..100:
//  - Semántica: coseno del mejor fragmento, quitándole el suelo de ruido.
//  - Léxica: fracción de términos de la búsqueda que aparecen LITERALMENTE.
// Se combinan con un "OR suave": si cualquiera es alta, el encaje es alto.
// Así "leroy" (aparece tal cual) puntúa alto aunque su significado sea pobre,
// y "profesor" (ni significado ni literal) puntúa bajo.
export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const db = await getDb();
  const q = await embed(query);

  // Todos los fragmentos con su parecido semántico, agrupados por candidato.
  const chunkRows = await db.select<
    { candidate_id: number; text: string; vector: string }[]
  >(
    `SELECT candidate_id, text, vector FROM candidate_chunks WHERE model = $1`,
    [MODEL_TAG],
  );
  interface Chunk {
    text: string;
    ntext: string;
    cos: number;
  }
  const byCand = new Map<number, Chunk[]>();
  const repSum = new Map<number, { sum: Float64Array; n: number }>();
  for (const r of chunkRows) {
    const vec = Float32Array.from(JSON.parse(r.vector) as number[]);
    const cos = cosine(q, vec);
    const arr = byCand.get(r.candidate_id) ?? [];
    arr.push({ text: r.text, ntext: norm(r.text), cos });
    byCand.set(r.candidate_id, arr);
    // Acumulamos para la representación media del candidato (preferencias).
    let acc = repSum.get(r.candidate_id);
    if (!acc) {
      acc = { sum: new Float64Array(vec.length), n: 0 };
      repSum.set(r.candidate_id, acc);
    }
    for (let i = 0; i < vec.length; i++) acc.sum[i] += vec[i];
    acc.n++;
  }

  // Representación de cada candidato = media normalizada de sus fragmentos.
  const repByCand = new Map<number, Float32Array>();
  for (const [id, acc] of repSum) {
    const rep = new Float32Array(acc.sum.length);
    let nrm = 0;
    for (let i = 0; i < rep.length; i++) {
      rep[i] = acc.sum[i] / acc.n;
      nrm += rep[i] * rep[i];
    }
    nrm = Math.sqrt(nrm);
    if (nrm > 1e-8) for (let i = 0; i < rep.length; i++) rep[i] /= nrm;
    repByCand.set(id, rep);
  }
  // Dirección de preferencia (Rocchio) a partir de tus votos 👍/👎.
  const pref = await computePreference(repByCand);

  // Datos de cada candidato (para la parte léxica y para mostrar).
  const cands = await db.select<
    {
      id: number;
      full_name: string | null;
      email: string | null;
      headline: string | null;
      education: string | null;
      source_file: string | null;
      raw_text: string | null;
    }[]
  >(
    `SELECT id, full_name, email, headline, education, source_file, raw_text
       FROM candidates`,
  );
  const terms = queryTerms(query);

  const hits: SearchHit[] = cands.map((c) => {
    const chunks = byCand.get(c.id) ?? [];
    const semBest = chunks.reduce<Chunk | undefined>(
      (best, ch) => (!best || ch.cos > best.cos ? ch : best),
      undefined,
    );
    const cos = semBest?.cos ?? 0;

    // Semántica calibrada: SEM_FLOOR -> 0, SEM_TOP -> 1.
    const calibSem = Math.min(1, Math.max(0, (cos - SEM_FLOOR) / (SEM_TOP - SEM_FLOOR)));

    // Léxica: qué términos de la búsqueda aparecen literalmente.
    const toks = norm(
      [c.full_name, c.headline, c.education, c.raw_text].filter(Boolean).join(" "),
    ).split(" ");
    const matched = terms.filter((t) => toks.includes(t));
    const lexCoverage = terms.length ? matched.length / terms.length : 0;

    // Mezcla GRADUADA (no binaria): 60% significado + 40% coincidencia exacta.
    // Más un empujón suave según tus preferencias aprendidas (👍/👎).
    const rep = repByCand.get(c.id);
    const boost = pref && rep ? PREF_WEIGHT * cosine(rep, pref) : 0;
    const display = Math.min(1, Math.max(0, 0.6 * calibSem + 0.4 * lexCoverage + boost));

    // Evidencia con sentido: si hay coincidencia literal, el fragmento que la
    // contiene (para que el "por qué encaja" cuadre); si no, el más parecido.
    let evidenceChunk = semBest;
    if (matched.length > 0) {
      const withMatch = chunks.filter((ch) => {
        const words = ch.ntext.split(" ");
        return matched.some((m) => words.includes(m));
      });
      if (withMatch.length > 0) {
        evidenceChunk = withMatch.reduce((best, ch) => (ch.cos > best.cos ? ch : best));
      }
    }

    // Razones estructuradas (sin LLM): qué coincide y por qué.
    const reasons: string[] = [];
    if (matched.length > 0) reasons.push(`menciona ${matched.join(", ")}`);
    if (calibSem >= 0.3) reasons.push("su perfil se parece por significado a lo que buscas");
    const why = reasons.length > 0 ? "Encaja porque " + reasons.join(", y ") + "." : "";

    return {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      headline: c.headline,
      source_file: c.source_file,
      score: display,
      evidence: evidenceChunk?.text ?? "",
      matched,
      why,
    };
  });

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
