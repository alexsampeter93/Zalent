import type { CandidateExportRow } from "./candidates";
import { STATUSES } from "./candidates";

// Genera el HTML de un DOSSIER de candidatos, listo para imprimir a PDF.
//
// A diferencia del CSV (datos crudos para Excel), esto es un documento
// PRESENTABLE: una ficha por candidato, para enseñar a un cliente o al jefe.
// La impresión la hace el sistema (ver print.ts); aquí solo se construye el
// HTML, que es la parte con sustancia y la que se puede probar.
//
// SEGURIDAD: los datos vienen de CVs que escribe gente de fuera. Todo lo que se
// mete en el HTML se escapa (`esc`), o un candidato podría inyectar marcado que
// descuadre el documento. Es la misma desconfianza que con la inyección de
// fórmulas del CSV (Diario 49), aquí en versión HTML.

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Etiqueta legible del estado ("oferta" → "Oferta enviada").
function statusLabel(key: string): string {
  return STATUSES.find((s) => s.key === key)?.label ?? key;
}

// Una fila "Etiqueta: valor", solo si hay valor (no ensuciamos con huecos).
function field(label: string, value: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<div class="field"><span class="k">${escapeHtml(label)}</span>` +
    `<span class="v">${escapeHtml(v)}</span></div>`;
}

// La ficha de un candidato. Salto de página después, para que cada uno empiece
// en su propia hoja al imprimir.
function candidateCard(c: CandidateExportRow): string {
  const years =
    c.years_experience != null
      ? `${c.years_experience} año${c.years_experience === 1 ? "" : "s"} de experiencia`
      : "";
  return `
    <section class="card">
      <header class="card-head">
        <h2>${escapeHtml(c.full_name ?? "(sin nombre)")}</h2>
        ${c.headline ? `<p class="headline">${escapeHtml(c.headline)}</p>` : ""}
        ${years ? `<p class="years">${escapeHtml(years)}</p>` : ""}
      </header>
      <div class="fields">
        ${field("Email", c.email)}
        ${field("Teléfono", c.phone)}
        ${field("Ubicación", c.location)}
        ${field("Estudios", c.education)}
        ${field("Skills", c.skills)}
        ${field("Idiomas", c.languages)}
        ${field("Etiquetas", c.tags)}
        ${field("Ofertas", c.vacancies)}
        ${field("Estado", statusLabel(c.status))}
        ${field("Enlaces", c.links)}
      </div>
    </section>`;
}

// Estilos del documento. Van EN LÍNEA (no un fichero aparte) porque el HTML se
// imprime en un contexto aislado (un iframe), sin acceso al CSS de la app.
// `@page` fija los márgenes del papel; `page-break-after` separa las fichas.
const STYLES = `
  * { box-sizing: border-box; }
  @page { margin: 18mm; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #1c1710; font-size: 12pt; line-height: 1.5; margin: 0;
  }
  .doc-head { border-bottom: 2px solid #d9a94e; padding-bottom: 8px; margin-bottom: 18px; }
  .doc-head h1 { margin: 0; font-size: 18pt; }
  .doc-head .meta { color: #6f6353; font-size: 10pt; margin-top: 2px; }
  .card { page-break-after: always; padding-top: 6px; }
  .card:last-child { page-break-after: auto; }
  .card-head h2 { margin: 0; font-size: 15pt; }
  .card-head .headline { margin: 2px 0 0; color: #5c4611; font-weight: 600; }
  .card-head .years { margin: 2px 0 0; color: #6f6353; font-size: 10pt; }
  .fields { margin-top: 12px; }
  .field { display: flex; gap: 10px; padding: 4px 0; border-bottom: 1px solid #eee; }
  .field .k { flex: 0 0 130px; color: #6f6353; font-weight: 600; }
  .field .v { flex: 1; white-space: pre-wrap; word-break: break-word; }
  .empty { color: #6f6353; font-style: italic; }
`;

export interface DossierOptions {
  title?: string; // p.ej. el nombre de una oferta
}

// Documento completo. Autocontenido: se puede escribir tal cual en un iframe.
export function buildDossierHtml(
  rows: CandidateExportRow[],
  opts: DossierOptions = {},
): string {
  const title = opts.title?.trim() || "Candidatos";
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const count = `${rows.length} candidato${rows.length === 1 ? "" : "s"}`;

  const body =
    rows.length === 0
      ? `<p class="empty">No hay candidatos que incluir en el dossier.</p>`
      : rows.map(candidateCard).join("\n");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="doc-head">
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(count)} · ${escapeHtml(fecha)}</p>
  </div>
  ${body}
</body>
</html>`;
}
