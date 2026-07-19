import { invoke } from "@tauri-apps/api/core";

// El PUENTE con la parte nativa para todo lo que sean vectores.
//
// Los vectores no viven en JavaScript. Se calculan aquí (el modelo corre en el
// webview y no hay alternativa), se mandan UNA vez a Rust al indexar, y a
// partir de ahí solo vuelven convertidos en números. El motivo está explicado a
// fondo en `src-tauri/src/lib.rs` y en el Diario, entrada 45; en corto: por el
// puente del plugin SQL un BLOB se infla a JSON en ambos sentidos, así que la
// columna binaria solo rinde si quien la toca es Rust.
//
// Este fichero es también el sitio ÚNICO donde se prepara la puntuación
// semántica. Antes `search.ts` y `match.ts` tenían el mismo bloque de 40 líneas
// duplicado (traer fragmentos → coseno → media por candidato → preferencia), y
// cualquier ajuste había que acordarse de hacerlo dos veces.

export const MODEL_TAG = "minilm-multilingual-v1";

// Un fragmento con su parecido a la consulta, ya calculado en Rust.
export interface ScoredChunk {
  text: string;
  ntext: string; // el texto normalizado (para la parte léxica)
  cos: number;
}

export interface Scoring {
  // Fragmentos de cada candidato, con su coseno.
  byCand: Map<number, ScoredChunk[]>;
  // Cuánto se parece el candidato a lo que sueles votar 👍 (Rocchio), SIN
  // ponderar: el peso lo aplica quien puntúa.
  affinity: (candidateId: number) => number;
}

interface RawResult {
  chunks: { candidate_id: number; text: string; cos: number }[];
  boosts: Record<string, number>;
}

// Guarda los fragmentos de un candidato (reemplaza los anteriores, en una
// transacción). `vectors[i]` corresponde a `texts[i]`.
export async function storeChunks(
  candidateId: number,
  texts: string[],
  vectors: Float32Array[],
): Promise<number> {
  return invoke<number>("store_chunks", {
    candidateId,
    model: MODEL_TAG,
    chunks: texts.map((text, idx) => ({
      idx,
      text,
      // Array normal porque tiene que viajar como JSON. Es el único momento en
      // que un vector cruza el puente, y ocurre al INDEXAR (donde el coste
      // real es calcular el embedding, no serializarlo).
      vector: Array.from(vectors[idx]),
    })),
  });
}

// Compara la consulta contra todos los fragmentos. Lo caro pasa en Rust.
export async function scoreAgainst(
  query: Float32Array,
  normalize: (s: string) => string,
): Promise<Scoring> {
  const raw = await invoke<RawResult>("score_chunks", {
    model: MODEL_TAG,
    query: Array.from(query),
  });

  const byCand = new Map<number, ScoredChunk[]>();
  for (const c of raw.chunks) {
    const arr = byCand.get(c.candidate_id) ?? [];
    arr.push({ text: c.text, ntext: normalize(c.text), cos: c.cos });
    byCand.set(c.candidate_id, arr);
  }

  return {
    byCand,
    affinity: (id) => raw.boosts[String(id)] ?? 0,
  };
}
