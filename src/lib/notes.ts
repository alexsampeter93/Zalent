import { getDb } from "./db";

export interface Note {
  id: number;
  body: string;
  created_at: string; // fecha/hora en UTC, tal como la guarda SQLite
}

// Añade una nota a un candidato. La fecha/hora la pone la BD automáticamente.
export async function addNote(candidateId: number, body: string): Promise<void> {
  const db = await getDb();
  await db.execute("INSERT INTO notes (candidate_id, body) VALUES ($1, $2)", [
    candidateId,
    body,
  ]);
}

// Notas de un candidato, de la más reciente a la más antigua (timeline).
export async function listNotes(candidateId: number): Promise<Note[]> {
  const db = await getDb();
  return db.select<Note[]>(
    "SELECT id, body, created_at FROM notes WHERE candidate_id = $1 ORDER BY id DESC",
    [candidateId],
  );
}
