import { getDb } from "./db";

// Normaliza una etiqueta: recorta espacios y colapsa los internos.
// (No forzamos minúsculas: respetamos cómo la escribe el recruiter.)
function cleanTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

// Añade una etiqueta a un candidato (si ya la tiene, no hace nada).
export async function addTag(candidateId: number, tag: string): Promise<void> {
  const t = cleanTag(tag);
  if (!t) return;
  const db = await getDb();
  await db.execute(
    `INSERT INTO candidate_tags (candidate_id, tag) VALUES ($1, $2)
     ON CONFLICT(candidate_id, tag) DO NOTHING`,
    [candidateId, t],
  );
}

export async function removeTag(candidateId: number, tag: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM candidate_tags WHERE candidate_id = $1 AND tag = $2",
    [candidateId, tag],
  );
}

// Etiquetas de un candidato (para su ficha).
export async function listCandidateTags(candidateId: number): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ tag: string }[]>(
    "SELECT tag FROM candidate_tags WHERE candidate_id = $1 ORDER BY tag COLLATE NOCASE",
    [candidateId],
  );
  return rows.map((r) => r.tag);
}

// Todas las etiquetas distintas (para sugerencias y el filtro).
export async function listAllTags(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ tag: string }[]>(
    "SELECT DISTINCT tag FROM candidate_tags ORDER BY tag COLLATE NOCASE",
  );
  return rows.map((r) => r.tag);
}

// Todas las asignaciones (para el mapa candidato→etiquetas y filtrar).
export async function listAllTagAssignments(): Promise<
  { candidate_id: number; tag: string }[]
> {
  const db = await getDb();
  return db.select<{ candidate_id: number; tag: string }[]>(
    "SELECT candidate_id, tag FROM candidate_tags",
  );
}
