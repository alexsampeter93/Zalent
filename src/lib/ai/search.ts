import { getDb } from "../db";
import { embed, cosine } from "./embeddings";

// Etiqueta del modelo: si algún día cambiamos de modelo, los vectores viejos
// quedan marcados y se pueden re-indexar sin confundirlos.
const MODEL_TAG = "minilm-multilingual-v1";

// Máximo de caracteres a embeber. El modelo solo "lee" las primeras ~128
// palabras, así que ponemos delante lo más informativo (titular, estudios)
// para que sobreviva al recorte. (Mejora futura: trocear el CV.)
function buildText(c: {
  full_name: string | null;
  headline: string | null;
  education: string | null;
  raw_text: string | null;
}): string {
  return [c.full_name, c.headline, c.education, c.raw_text]
    .filter(Boolean)
    .join(" \n ")
    .slice(0, 1500);
}

// Calcula y guarda el vector de cada candidato que aún no lo tenga (para este
// modelo). Devuelve cuántos ha indexado.
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
       LEFT JOIN candidate_vectors v
         ON v.candidate_id = c.id AND v.model = $1
      WHERE v.candidate_id IS NULL`,
    [MODEL_TAG],
  );

  let done = 0;
  for (const c of pending) {
    const vec = await embed(buildText(c));
    await db.execute(
      `INSERT INTO candidate_vectors (candidate_id, model, vector, updated_at)
       VALUES ($1, $2, $3, datetime('now'))
       ON CONFLICT(candidate_id)
       DO UPDATE SET model = $2, vector = $3, updated_at = datetime('now')`,
      [c.id, MODEL_TAG, JSON.stringify(Array.from(vec))],
    );
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
}

// Busca por significado: convierte la consulta en vector y la compara con los
// vectores guardados de cada candidato, ordenando por cercanía.
export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const db = await getDb();
  const q = await embed(query);

  const rows = await db.select<
    {
      candidate_id: number;
      vector: string;
      full_name: string | null;
      headline: string | null;
      source_file: string | null;
    }[]
  >(
    `SELECT v.candidate_id, v.vector, c.full_name, c.headline, c.source_file
       FROM candidate_vectors v
       JOIN candidates c ON c.id = v.candidate_id
      WHERE v.model = $1`,
    [MODEL_TAG],
  );

  const hits: SearchHit[] = rows.map((r) => ({
    id: r.candidate_id,
    full_name: r.full_name,
    headline: r.headline,
    source_file: r.source_file,
    score: cosine(q, Float32Array.from(JSON.parse(r.vector) as number[])),
  }));

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
