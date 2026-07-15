import { getDb } from "./db";

// Voto del recruiter sobre un candidato: 1 = 👍 (encaja), -1 = 👎 (no).
// Es la señal con la que Zalent "aprende" tus preferencias (Fase 6).

export type Vote = 1 | -1;

// Fija el voto (crea o actualiza). Con `null` lo elimina (voto neutro).
export async function setVote(
  candidateId: number,
  vote: Vote | null,
): Promise<void> {
  const db = await getDb();
  if (vote === null) {
    await db.execute("DELETE FROM feedback WHERE candidate_id = $1", [candidateId]);
    return;
  }
  await db.execute(
    `INSERT INTO feedback (candidate_id, vote, updated_at)
     VALUES ($1, $2, datetime('now'))
     ON CONFLICT(candidate_id) DO UPDATE SET vote = $2, updated_at = datetime('now')`,
    [candidateId, vote],
  );
}

// Todos los votos (para construir un mapa candidato→voto).
export async function listVotes(): Promise<{ candidate_id: number; vote: number }[]> {
  const db = await getDb();
  return db.select<{ candidate_id: number; vote: number }[]>(
    "SELECT candidate_id, vote FROM feedback",
  );
}
