import { getDb } from "./db";
import { deleteCvFile } from "./files";
import { ref, transaction, type Stmt } from "./tx";

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

// Todas las tablas que cuelgan de un candidato por `candidate_id`.
//
// Una sola lista, usada por el borrado, el limpiado de huérfanos y el borrado
// total. Antes estaba repetida tres veces con distinto orden, que es la forma
// clásica de que un día se añada una tabla nueva y solo se acuerde uno de los
// tres sitios — dejando datos personales de alguien que pidió que se le
// borrara.
const RELATED_TABLES = [
  "notes",
  "skills",
  "languages",
  "candidate_tags",
  "candidate_vacancy",
  "candidate_chunks",
  "candidate_vectors",
  "feedback",
] as const;

// Inserta el candidato y sus skills/idiomas. Devuelve el id nuevo.
//
// Todo en un bloque atómico: antes eran INSERT sueltos, así que un fallo a
// mitad dejaba un candidato guardado con la mitad de sus skills y sin que
// nadie se enterase. `ref(0)` es el id que genere el primer INSERT.
export async function saveCandidate(c: CandidateInput): Promise<number> {
  const stmts: Stmt[] = [
    [
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
    ],
    ...c.skills.map<Stmt>((name) => [
      "INSERT INTO skills (candidate_id, name) VALUES ($1, $2)",
      [ref(0), name],
    ]),
    ...c.languages.map<Stmt>((name) => [
      "INSERT INTO languages (candidate_id, name) VALUES ($1, $2)",
      [ref(0), name],
    ]),
  ];

  const ids = await transaction(stmts);
  return ids[0];
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

  // Borrado en cascada de TODO lo relacionado (no dejar huérfanos). Atómico:
  // un borrado a medias dejaría datos personales de alguien que pidió que se
  // le borrara, que es justo lo que el RGPD no perdona.
  await transaction([
    ...RELATED_TABLES.map<Stmt>((t) => [
      `DELETE FROM ${t} WHERE candidate_id = $1`,
      [id],
    ]),
    ["DELETE FROM candidates WHERE id = $1", [id]],
  ]);

  // El archivo, al final (best-effort; que un fallo aquí no impida el borrado).
  if (filePath) await deleteCvFile(filePath);
}

// Anonimiza un candidato (RGPD): quita los datos personales (nombre, email,
// teléfono, ubicación, enlaces), borra el archivo del CV y el texto/vectores
// (que contienen su nombre), pero conserva lo agregado (puesto, skills, años,
// etiquetas, su sitio en el pipeline) por si quieres estadísticas.
export async function anonymizeCandidate(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ file_path: string | null }[]>(
    "SELECT file_path FROM candidates WHERE id = $1",
    [id],
  );
  const filePath = rows[0]?.file_path;
  if (filePath) await deleteCvFile(filePath);

  // Atómico: si se borrasen los vectores pero la ficha siguiera con el nombre,
  // el candidato quedaría medio anonimizado — ni borrado ni intacto.
  await transaction([
    ["DELETE FROM candidate_chunks WHERE candidate_id = $1", [id]],
    ["DELETE FROM candidate_vectors WHERE candidate_id = $1", [id]],
    [
      `UPDATE candidates
          SET full_name = '[anonimizado]', email = NULL, phone = NULL,
              location = NULL, links = NULL, raw_text = NULL, file_path = NULL,
              source_file = '[anonimizado]', updated_at = datetime('now')
        WHERE id = $1`,
      [id],
    ],
  ]);
}

// Borra TODOS los datos: candidatos, ofertas, notas, etiquetas, votos y los
// archivos de CV del disco. Derecho al olvido (RGPD) a nivel de toda la base.
export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  // Primero los ficheros del disco.
  const files = await db.select<{ file_path: string | null }[]>(
    "SELECT file_path FROM candidates WHERE file_path IS NOT NULL",
  );
  for (const f of files) {
    if (f.file_path) await deleteCvFile(f.file_path);
  }
  // Luego todas las tablas, de golpe. Un borrado total a medias sería lo peor
  // de los dos mundos: el usuario cree que no queda nada y sí queda.
  await transaction([
    ...RELATED_TABLES.map<Stmt>((t) => [`DELETE FROM ${t}`]),
    ["DELETE FROM candidates"],
    ["DELETE FROM vacancies"],
  ]);
}

// Limpia filas huérfanas (relacionadas con candidatos que ya no existen).
// Se ejecuta al arrancar; corrige conteos inflados por borrados antiguos.
export async function cleanupOrphans(): Promise<void> {
  await transaction(
    RELATED_TABLES.map<Stmt>((t) => [
      `DELETE FROM ${t} WHERE candidate_id NOT IN (SELECT id FROM candidates)`,
    ]),
  );
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

// Ficha completa y APLANADA de cada candidato, para exportar.
//
// Skills, idiomas, etiquetas y ofertas están en tablas aparte (uno-a-muchos),
// pero un CSV tiene una fila por candidato: se juntan en una sola celda con
// `group_concat`. Se hace en SQL y no en JavaScript para no lanzar cuatro
// consultas por candidato (con 500 candidatos serían 2.000 viajes a la base).
export interface CandidateExportRow {
  id: number;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  years_experience: number | null;
  education: string | null;
  links: string | null;
  status: string;
  created_at: string;
  source_file: string | null;
  skills: string | null;
  languages: string | null;
  tags: string | null;
  vacancies: string | null;
}

export async function listForExport(): Promise<CandidateExportRow[]> {
  const db = await getDb();
  return db.select<CandidateExportRow[]>(
    `SELECT c.id, c.full_name, c.email, c.phone, c.location, c.headline,
            c.years_experience, c.education, c.links, c.status, c.created_at,
            c.source_file,
            (SELECT group_concat(name, ', ')  FROM skills     WHERE candidate_id = c.id) AS skills,
            (SELECT group_concat(name, ', ')  FROM languages  WHERE candidate_id = c.id) AS languages,
            (SELECT group_concat(tag, ', ')   FROM candidate_tags WHERE candidate_id = c.id) AS tags,
            (SELECT group_concat(v.title, ', ')
               FROM candidate_vacancy cv
               JOIN vacancies v ON v.id = cv.vacancy_id
              WHERE cv.candidate_id = c.id) AS vacancies
       FROM candidates c
      ORDER BY c.id DESC`,
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
  await transaction([
    [
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
    ],
    // Skills e idiomas: borrar los antiguos y volver a insertar la lista nueva.
    ["DELETE FROM skills WHERE candidate_id = $1", [id]],
    ["DELETE FROM languages WHERE candidate_id = $1", [id]],
    ...c.skills.map<Stmt>((name) => [
      "INSERT INTO skills (candidate_id, name) VALUES ($1, $2)",
      [id, name],
    ]),
    ...c.languages.map<Stmt>((name) => [
      "INSERT INTO languages (candidate_id, name) VALUES ($1, $2)",
      [id, name],
    ]),
    // Invalidamos el índice de búsqueda de ESTE candidato. Los fragmentos de
    // `candidate_chunks` se generaron a partir de nombre/puesto/estudios/texto:
    // si acabamos de cambiarlos, ese índice quedó obsoleto y la búsqueda
    // semántica seguiría encontrando al candidato por sus datos VIEJOS.
    // Al borrarlos, `indexAllCandidates()` lo ve "sin indexar" y lo reconstruye
    // en la siguiente búsqueda (solo indexa a quien no tiene fragmentos).
    //
    // Va DENTRO de la transacción a propósito: si la edición se deshiciera y
    // el índice ya estuviera borrado, se reindexaría con los datos viejos —
    // correcto, pero un trabajo inútil que además confunde al depurar.
    ["DELETE FROM candidate_chunks WHERE candidate_id = $1", [id]],
  ]);
}
