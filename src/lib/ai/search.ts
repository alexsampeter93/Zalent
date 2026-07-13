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
  score: number;
  evidence: string; // el fragmento del CV que mejor encajó
}

// Busca por significado a nivel de fragmento: para cada candidato nos quedamos
// con su mejor trozo (score + texto = evidencia) y ordenamos por ese score.
export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const db = await getDb();
  const q = await embed(query);

  const rows = await db.select<
    {
      candidate_id: number;
      text: string;
      vector: string;
      full_name: string | null;
      headline: string | null;
      source_file: string | null;
    }[]
  >(
    `SELECT ch.candidate_id, ch.text, ch.vector,
            c.full_name, c.headline, c.source_file
       FROM candidate_chunks ch
       JOIN candidates c ON c.id = ch.candidate_id
      WHERE ch.model = $1`,
    [MODEL_TAG],
  );

  const best = new Map<number, SearchHit>();
  for (const r of rows) {
    const score = cosine(q, Float32Array.from(JSON.parse(r.vector) as number[]));
    const current = best.get(r.candidate_id);
    if (!current || score > current.score) {
      best.set(r.candidate_id, {
        id: r.candidate_id,
        full_name: r.full_name,
        headline: r.headline,
        source_file: r.source_file,
        score,
        evidence: r.text,
      });
    }
  }

  const hits = [...best.values()];
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
