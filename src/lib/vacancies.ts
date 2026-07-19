import { getDb } from "./db";
import { transaction } from "./tx";

// Una oferta/puesto de trabajo. La empresa puede tener varias abiertas a la vez.
export interface Vacancy {
  id: number;
  title: string;
  description: string;
  status: string; // "abierta" | "cerrada"
  created_at: string;
  updated_at: string;
}

// Oferta con el nº de candidatos asignados (para la lista).
export interface VacancyWithCount extends Vacancy {
  candidate_count: number;
}

// Las fases del pipeline son las mismas que ya usamos (por oferta).
export { STATUSES as STAGES } from "./candidates";

// ----- Ofertas -----

export async function createVacancy(
  title: string,
  description = "",
): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    "INSERT INTO vacancies (title, description) VALUES ($1, $2)",
    [title.trim(), description],
  );
  return res.lastInsertId as number;
}

export async function listVacancies(): Promise<VacancyWithCount[]> {
  const db = await getDb();
  return db.select<VacancyWithCount[]>(
    `SELECT v.id, v.title, v.description, v.status, v.created_at, v.updated_at,
            COUNT(cv.candidate_id) AS candidate_count
       FROM vacancies v
       LEFT JOIN candidate_vacancy cv ON cv.vacancy_id = v.id
      GROUP BY v.id
      ORDER BY v.created_at DESC`,
  );
}

export async function getVacancy(id: number): Promise<Vacancy | null> {
  const db = await getDb();
  const rows = await db.select<Vacancy[]>(
    "SELECT id, title, description, status, created_at, updated_at FROM vacancies WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function updateVacancy(
  id: number,
  fields: { title?: string; description?: string; status?: string },
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (fields.title !== undefined) {
    sets.push(`title = $${i++}`);
    vals.push(fields.title.trim());
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${i++}`);
    vals.push(fields.description);
  }
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(fields.status);
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = datetime('now')`);
  vals.push(id);
  await db.execute(`UPDATE vacancies SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

// Borra la oferta y sus asignaciones. NUNCA borra candidatos ni sus CVs:
// el almacén raíz es la fuente de verdad y permanece intacto.
//
// Es la ÚNICA escritura de este fichero con más de una sentencia, y por eso la
// única que necesita ser atómica: si se borrara la oferta pero no sus
// asignaciones, quedarían filas apuntando a una oferta que ya no existe y los
// recuentos del Panel saldrían inflados. El resto de escrituras de aquí (y las
// de `notes.ts` y `tags.ts`) son de una sola sentencia, que en SQLite ya es
// atómica por sí misma: envolverlas no añadiría ninguna garantía.
export async function deleteVacancy(id: number): Promise<void> {
  await transaction([
    ["DELETE FROM candidate_vacancy WHERE vacancy_id = $1", [id]],
    ["DELETE FROM vacancies WHERE id = $1", [id]],
  ]);
}

// ----- Asignaciones candidato ↔ oferta -----

// Añade un candidato a una oferta (si ya está, no hace nada).
export async function addCandidateToVacancy(
  candidateId: number,
  vacancyId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO candidate_vacancy (candidate_id, vacancy_id)
     VALUES ($1, $2)
     ON CONFLICT(candidate_id, vacancy_id) DO NOTHING`,
    [candidateId, vacancyId],
  );
}

export async function removeCandidateFromVacancy(
  candidateId: number,
  vacancyId: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM candidate_vacancy WHERE candidate_id = $1 AND vacancy_id = $2",
    [candidateId, vacancyId],
  );
}

// Cambia la fase de un candidato DENTRO de una oferta (pipeline por oferta).
export async function setCandidateStage(
  candidateId: number,
  vacancyId: number,
  stage: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE candidate_vacancy SET stage = $1 WHERE candidate_id = $2 AND vacancy_id = $3",
    [stage, candidateId, vacancyId],
  );
}

// Candidato dentro de una oferta, con su fase en ESA oferta.
export interface VacancyCandidate {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  source_file: string | null;
  file_path: string | null;
  stage: string;
}

export async function listVacancyCandidates(
  vacancyId: number,
): Promise<VacancyCandidate[]> {
  const db = await getDb();
  return db.select<VacancyCandidate[]>(
    `SELECT c.id, c.full_name, c.email, c.headline, c.source_file, c.file_path,
            cv.stage
       FROM candidate_vacancy cv
       JOIN candidates c ON c.id = cv.candidate_id
      WHERE cv.vacancy_id = $1
      ORDER BY c.full_name COLLATE NOCASE`,
    [vacancyId],
  );
}

// Todas las asignaciones (para construir un mapa candidato→ofertas y filtrar).
export async function listAllMemberships(): Promise<
  { candidate_id: number; vacancy_id: number }[]
> {
  const db = await getDb();
  return db.select<{ candidate_id: number; vacancy_id: number }[]>(
    "SELECT candidate_id, vacancy_id FROM candidate_vacancy",
  );
}

// Reparto de asignaciones por fase, sumando TODAS las ofertas (para el Panel).
export async function stageDistribution(): Promise<
  { stage: string; count: number }[]
> {
  const db = await getDb();
  return db.select<{ stage: string; count: number }[]>(
    "SELECT stage, COUNT(*) AS count FROM candidate_vacancy GROUP BY stage",
  );
}

// Ofertas a las que pertenece un candidato (para su ficha).
export async function listCandidateVacancies(
  candidateId: number,
): Promise<{ id: number; title: string; stage: string }[]> {
  const db = await getDb();
  return db.select<{ id: number; title: string; stage: string }[]>(
    `SELECT v.id, v.title, cv.stage
       FROM candidate_vacancy cv
       JOIN vacancies v ON v.id = cv.vacancy_id
      WHERE cv.candidate_id = $1
      ORDER BY v.title COLLATE NOCASE`,
    [candidateId],
  );
}
