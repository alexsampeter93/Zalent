import { getDb } from "../db";

// Vector de PREFERENCIA (algoritmo de Rocchio, versión sencilla):
// la dirección media de los perfiles que te gustan (👍) MENOS la de los que
// rechazas (👎), a partir de tus votos. Sirve para reordenar: los candidatos
// parecidos a esa dirección suben; los opuestos bajan.
//
// `repByCand` es la representación de cada candidato (un vector por candidato,
// p.ej. la media de sus fragmentos). Devuelve null si aún no hay señal.
export async function computePreference(
  repByCand: Map<number, Float32Array>,
): Promise<Float32Array | null> {
  const db = await getDb();
  const votes = await db.select<{ candidate_id: number; vote: number }[]>(
    "SELECT candidate_id, vote FROM feedback",
  );
  if (votes.length === 0) return null;

  let dim = 0;
  for (const v of repByCand.values()) {
    dim = v.length;
    break;
  }
  if (dim === 0) return null;

  const sumLiked = new Float64Array(dim);
  const sumDisliked = new Float64Array(dim);
  let nLiked = 0;
  let nDisliked = 0;
  for (const { candidate_id, vote } of votes) {
    const rep = repByCand.get(candidate_id);
    if (!rep) continue;
    if (vote > 0) {
      for (let i = 0; i < dim; i++) sumLiked[i] += rep[i];
      nLiked++;
    } else {
      for (let i = 0; i < dim; i++) sumDisliked[i] += rep[i];
      nDisliked++;
    }
  }
  if (nLiked === 0 && nDisliked === 0) return null;

  const pref = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    const liked = nLiked ? sumLiked[i] / nLiked : 0;
    const disliked = nDisliked ? sumDisliked[i] / nDisliked : 0;
    pref[i] = liked - disliked;
  }

  // Normalizar a longitud 1 (para que el coseno sea comparable).
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += pref[i] * pref[i];
  norm = Math.sqrt(norm);
  if (norm < 1e-8) return null;
  for (let i = 0; i < dim; i++) pref[i] /= norm;
  return pref;
}

// Peso del empujón por preferencia (suave: reordena sin falsear el %).
export const PREF_WEIGHT = 0.12;
