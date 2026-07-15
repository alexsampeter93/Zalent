import { getDb } from "./db";
import { deleteCvFile } from "./files";

// Datos de una ficha lista para guardar. `skills` e `languages` son listas
// porque van a sus propias tablas (relación uno-a-muchos con el candidato).
export interface CandidateInput {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: number | null;
  education: string;
  links: string;
  raw_text: string;
  source_file: string;
  file_path: string | null;
  skills: string[];
  languages: string[];
}

// Fila resumida para mostrar en la lista de candidatos guardados.
export interface CandidateRow {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  source_file: string | null;
  status: string;
  created_at: string;
}

// Convierte "" en null para no guardar cadenas vacías en la BD.
function orNull(value: string): string | null {
  const v = value.trim();
  return v === "" ? null : v;
}

// Inserta el candidato y sus skills/idiomas. Devuelve el id nuevo.
export async function saveCandidate(c: CandidateInput): Promise<number> {
  const db = await getDb();

  const res = await db.execute(
    `INSERT INTO candidates
       (full_name, email, phone, location, headline, years_experience,
        education, links, raw_text, source_file, file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      orNull(c.full_name),
      orNull(c.email),
      orNull(c.phone),
      orNull(c.location),
      orNull(c.headline),
      c.years_experience,
      orNull(c.education),
      orNull(c.links),
      orNull(c.raw_text),
      orNull(c.source_file),
      c.file_path,
    ],
  );

  const candidateId = res.lastInsertId as number;

  for (const name of c.skills) {
    await db.execute(
      "INSERT INTO skills (candidate_id, name) VALUES ($1, $2)",
      [candidateId, name],
    );
  }
  for (const name of c.languages) {
    await db.execute(
      "INSERT INTO languages (candidate_id, name) VALUES ($1, $2)",
      [candidateId, name],
    );
  }

  return candidateId;
}

// Borrado real (RGPD): elimina la ficha y TODO lo asociado (notas, skills,
// idiomas). Lo hacemos explícito para no depender de la config de la BD.
export async function deleteCandidate(id: number): Promise<void> {
  const db = await getDb();
  // Guardamos la ruta del CV para borrarlo del disco después (RGPD).
  const rows = await db.select<{ file_path: string | null }[]>(
    "SELECT file_path FROM candidates WHERE id = $1",
    [id],
  );
  const filePath = rows[0]?.file_path;

  // Borrado en cascada de TODO lo relacionado (no dejar huérfanos).
  await db.execute("DELETE FROM notes WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM skills WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM languages WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM candidate_tags WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM candidate_vacancy WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM candidate_chunks WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM candidate_vectors WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM feedback WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM candidates WHERE id = $1", [id]);

  // El archivo, al final (best-effort; que un fallo aquí no impida el borrado).
  if (filePath) await deleteCvFile(filePath);
}

// Limpia filas huérfanas (relacionadas con candidatos que ya no existen).
// Se ejecuta al arrancar; corrige conteos inflados por borrados antiguos.
export async function cleanupOrphans(): Promise<void> {
  const db = await getDb();
  const tables = [
    "notes",
    "skills",
    "languages",
    "candidate_tags",
    "candidate_vacancy",
    "candidate_chunks",
    "candidate_vectors",
    "feedback",
  ];
  for (const t of tables) {
    await db.execute(
      `DELETE FROM ${t} WHERE candidate_id NOT IN (SELECT id FROM candidates)`,
    );
  }
}

// Estados posibles del candidato en el proceso de selección.
export const STATUSES = [
  { key: "nuevo", label: "Nuevo" },
  { key: "entrevista", label: "Entrevista" },
  { key: "oferta", label: "Oferta enviada" },
  { key: "descartado", label: "Descartado" },
] as const;

// Cambia el estado de un candidato (para el pipeline).
export async function updateCandidateStatus(id: number, status: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE candidates SET status = $1, updated_at = datetime('now') WHERE id = $2",
    [status, id],
  );
}

// Lista los candidatos guardados, del más reciente al más antiguo.
export async function listCandidates(): Promise<CandidateRow[]> {
  const db = await getDb();
  return db.select<CandidateRow[]>(
    "SELECT id, full_name, email, headline, source_file, status, created_at FROM candidates ORDER BY id DESC",
  );
}

// Datos mínimos de todos los candidatos para clasificarlos en lote.
export async function listForClassification(): Promise<
  { id: number; raw_text: string | null; years_experience: number | null }[]
> {
  const db = await getDb();
  return db.select<
    { id: number; raw_text: string | null; years_experience: number | null }[]
  >("SELECT id, raw_text, years_experience FROM candidates");
}

// Ficha completa de un candidato (con sus skills e idiomas) para el detalle.
export interface CandidateDetail {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  years_experience: number | null;
  education: string | null;
  links: string | null;
  source_file: string | null;
  file_path: string | null;
  raw_text: string | null;
  status: string;
  created_at: string;
  skills: string[];
  languages: string[];
}

export async function getCandidate(id: number): Promise<CandidateDetail | null> {
  const db = await getDb();
  const rows = await db.select<CandidateDetail[]>(
    "SELECT id, full_name, email, phone, location, headline, years_experience, education, links, source_file, file_path, raw_text, status, created_at FROM candidates WHERE id = $1",
    [id],
  );
  if (rows.length === 0) return null;

  const skills = (
    await db.select<{ name: string }[]>(
      "SELECT name FROM skills WHERE candidate_id = $1 ORDER BY id",
      [id],
    )
  ).map((r) => r.name);
  const languages = (
    await db.select<{ name: string }[]>(
      "SELECT name FROM languages WHERE candidate_id = $1 ORDER BY id",
      [id],
    )
  ).map((r) => r.name);

  return { ...rows[0], skills, languages };
}

// Campos editables de una ficha (sin raw_text ni source_file, que no se tocan).
export interface CandidateUpdate {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: number | null;
  education: string;
  links: string;
  skills: string[];
  languages: string[];
}

// Actualiza la ficha y reemplaza sus skills/idiomas por los nuevos.
export async function updateCandidate(
  id: number,
  c: CandidateUpdate,
): Promise<void> {
  const db = await getDb();

  await db.execute(
    `UPDATE candidates SET
       full_name = $1, email = $2, phone = $3, location = $4, headline = $5,
       years_experience = $6, education = $7, links = $8,
       updated_at = datetime('now')
     WHERE id = $9`,
    [
      orNull(c.full_name),
      orNull(c.email),
      orNull(c.phone),
      orNull(c.location),
      orNull(c.headline),
      c.years_experience,
      orNull(c.education),
      orNull(c.links),
      id,
    ],
  );

  // Skills e idiomas: borrar los antiguos y volver a insertar la lista nueva.
  await db.execute("DELETE FROM skills WHERE candidate_id = $1", [id]);
  await db.execute("DELETE FROM languages WHERE candidate_id = $1", [id]);
  for (const name of c.skills) {
    await db.execute("INSERT INTO skills (candidate_id, name) VALUES ($1, $2)", [
      id,
      name,
    ]);
  }
  for (const name of c.languages) {
    await db.execute(
      "INSERT INTO languages (candidate_id, name) VALUES ($1, $2)",
      [id, name],
    );
  }
}
