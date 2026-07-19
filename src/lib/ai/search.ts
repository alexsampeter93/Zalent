import { getDb } from "../db";
import { embed } from "./embeddings";
import { PREF_WEIGHT } from "./preference";
import {
  MODEL_TAG,
  scoreAgainst,
  storeChunks,
  type ScoredChunk,
} from "./vectors";

// Trocea un texto en fragmentos de ~60 palabras con solape, para que cada
// trozo entre en el modelo (~128 palabras) y sirva como "evidencia" legible.
const CHUNK_WORDS = 60;
const OVERLAP = 12;
const MAX_CHUNKS = 40; // tope por candidato, por si un CV es larguísimo

export function chunkText(text: string): string[] {
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

    // Los embeddings se calculan aquí (el modelo corre en el webview) y se
    // guardan de una sola vez: Rust los escribe en binario y en una
    // transacción, así que un fallo a mitad no deja medio índice.
    const vectors: Float32Array[] = [];
    for (const ch of chunks) vectors.push(await embed(ch));
    await storeChunks(c.id, chunks, vectors);

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

export function queryTerms(query: string): string[] {
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

  // Todo el trabajo con vectores ocurre en Rust: comparar la consulta contra
  // cada fragmento y calcular la afinidad con tus votos 👍/👎. Lo que vuelve
  // son textos y números, no vectores.
  const scoring = await scoreAgainst(q, norm);

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
    const chunks = scoring.byCand.get(c.id) ?? [];
    const semBest = chunks.reduce<ScoredChunk | undefined>(
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
    const boost = PREF_WEIGHT * scoring.affinity(c.id);
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
