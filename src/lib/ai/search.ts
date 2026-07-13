import { getDb } from "../db";
import { embed, cosine } from "./embeddings";

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

export interface SearchHit {
  id: number;
  full_name: string | null;
  headline: string | null;
  source_file: string | null;
  score: number; // similitud SEMÁNTICA (para mostrar como "encaje")
  evidence: string; // el fragmento del CV que mejor encajó
  matched: string[]; // términos de la búsqueda que coinciden LITERALMENTE
}

// Palabras vacías: muy comunes, aportan poco a la coincidencia léxica.
const STOPWORDS = new Set([
  "con", "para", "los", "las", "del", "una", "uno", "que", "por", "como",
  "sus", "sobre", "entre", "experiencia", "anos", "perfil", "trabajo",
]);

// Normaliza: minúsculas, sin acentos, solo letras/números y espacios.
function norm(s: string): string {
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

// Dado un orden de ids, devuelve id -> posición (1 = el mejor).
function rankMap(orderedIds: number[]): Map<number, number> {
  const m = new Map<number, number>();
  orderedIds.forEach((id, i) => m.set(id, i + 1));
  return m;
}

// Búsqueda HÍBRIDA: fusiona la señal semántica (significado) con la léxica
// (coincidencia exacta de palabras, TF-IDF) usando Reciprocal Rank Fusion.
export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const db = await getDb();
  const q = await embed(query);

  // --- 1) Semántica: mejor fragmento por candidato (score + evidencia) ---
  const chunkRows = await db.select<
    { candidate_id: number; text: string; vector: string }[]
  >(
    `SELECT candidate_id, text, vector FROM candidate_chunks WHERE model = $1`,
    [MODEL_TAG],
  );
  const sem = new Map<number, { score: number; evidence: string }>();
  for (const r of chunkRows) {
    const score = cosine(q, Float32Array.from(JSON.parse(r.vector) as number[]));
    const cur = sem.get(r.candidate_id);
    if (!cur || score > cur.score) {
      sem.set(r.candidate_id, { score, evidence: r.text });
    }
  }

  // --- 2) Léxica: TF-IDF de los términos de la búsqueda por candidato ---
  const cands = await db.select<
    {
      id: number;
      full_name: string | null;
      headline: string | null;
      education: string | null;
      source_file: string | null;
      raw_text: string | null;
    }[]
  >(
    `SELECT id, full_name, headline, education, source_file, raw_text
       FROM candidates`,
  );
  const terms = queryTerms(query);
  const N = Math.max(cands.length, 1);

  // Tokenizamos cada candidato y contamos en cuántos aparece cada término (df).
  const tokensById = new Map<number, string[]>();
  const df = new Map<string, number>();
  for (const c of cands) {
    const toks = norm(
      [c.full_name, c.headline, c.education, c.raw_text].filter(Boolean).join(" "),
    ).split(" ");
    tokensById.set(c.id, toks);
    for (const term of terms) {
      if (toks.includes(term)) df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  const lex = new Map<number, { score: number; matched: string[] }>();
  for (const c of cands) {
    const toks = tokensById.get(c.id)!;
    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      const tf = toks.filter((w) => w === term).length;
      if (tf > 0) {
        const idf = Math.log(1 + N / (df.get(term) ?? 1));
        score += (1 + Math.log(tf)) * idf;
        matched.push(term);
      }
    }
    lex.set(c.id, { score, matched });
  }

  // --- 3) Fusión RRF: combinamos las dos clasificaciones ---
  const semRank = rankMap(
    [...sem.entries()].sort((a, b) => b[1].score - a[1].score).map((e) => e[0]),
  );
  const lexRank = rankMap(
    [...lex.entries()]
      .filter((e) => e[1].score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .map((e) => e[0]),
  );

  const K = 60;
  const big = cands.length + 1;
  const fused = cands.map((c) => {
    const rs = semRank.get(c.id) ?? big;
    const rl = lexRank.get(c.id) ?? big;
    const fusedScore = 1 / (K + rs) + 1 / (K + rl);
    return {
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      source_file: c.source_file,
      score: sem.get(c.id)?.score ?? 0,
      evidence: sem.get(c.id)?.evidence ?? "",
      matched: lex.get(c.id)?.matched ?? [],
      fusedScore,
    };
  });

  fused.sort((a, b) => b.fusedScore - a.fusedScore);
  return fused.slice(0, limit).map(({ fusedScore: _f, ...hit }) => hit);
}
