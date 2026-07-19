import { invoke } from "@tauri-apps/api/core";
import { listForExport, STATUSES, type CandidateExportRow } from "./candidates";
import { toCsv, exportFileName, type Column } from "./export";

// Qué columnas lleva la exportación de candidatos, en qué orden y con qué
// nombre. Es el fichero que un responsable de RRHH abrirá en Excel o pasará a
// un cliente, así que las cabeceras van en español y en el orden en que se lee
// una ficha: primero quién es, luego cómo contactar, luego su perfil.
const COLUMNS: Column<CandidateExportRow>[] = [
  { header: "Nombre", value: (c) => c.full_name },
  { header: "Email", value: (c) => c.email },
  { header: "Teléfono", value: (c) => c.phone },
  { header: "Ubicación", value: (c) => c.location },
  { header: "Puesto", value: (c) => c.headline },
  { header: "Años de experiencia", value: (c) => c.years_experience },
  { header: "Estudios", value: (c) => c.education },
  { header: "Skills", value: (c) => c.skills },
  { header: "Idiomas", value: (c) => c.languages },
  { header: "Etiquetas", value: (c) => c.tags },
  { header: "Ofertas", value: (c) => c.vacancies },
  {
    header: "Estado",
    // En la base el estado es una clave ("oferta"); en el CSV va la etiqueta
    // que se ve en pantalla ("Oferta enviada"), porque quien abra el fichero no
    // tiene por qué conocer nuestras claves internas.
    value: (c) => STATUSES.find((s) => s.key === c.status)?.label ?? c.status,
  },
  { header: "Enlaces", value: (c) => c.links },
  { header: "Archivo del CV", value: (c) => c.source_file },
  {
    header: "Fecha de alta",
    // SQLite guarda "YYYY-MM-DD HH:MM:SS" en UTC. Se pasa a fecha local y a
    // formato español, que es lo que espera quien abra el fichero.
    value: (c) => new Date(c.created_at.replace(" ", "T") + "Z").toLocaleString("es-ES"),
  },
];

export interface ExportResult {
  path: string;
  count: number;
}

// Exporta candidatos a un CSV en la carpeta de Descargas.
//
// `ids` limita la exportación a lo que el usuario está viendo (sus filtros o su
// selección). Si no se pasa, van todos. Exportar lo VISIBLE y no siempre todo
// es importante: si has filtrado por una oferta, esperas el fichero de esa
// oferta, no de la base entera.
export async function exportCandidatesCsv(
  ids?: Iterable<number>,
  prefix = "candidatos",
): Promise<ExportResult> {
  const all = await listForExport();
  const wanted = ids ? new Set(ids) : null;
  const rows = wanted ? all.filter((c) => wanted.has(c.id)) : all;

  const path = await invoke<string>("save_export", {
    filename: exportFileName(prefix),
    contents: toCsv(rows, COLUMNS),
  });
  return { path, count: rows.length };
}
