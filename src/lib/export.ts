// Exportar a CSV.
//
// Suena a "unir textos con comas" y no lo es. Un CSV que se abre mal es un CSV
// que no sirve, y hay tres cosas que lo estropean:
//
//   1. El SEPARADOR. Excel en español no usa la coma: usa el punto y coma,
//      porque la coma es el separador decimal. Un CSV con comas se abre en
//      Windows español con TODO metido en la primera columna.
//   2. La CODIFICACIÓN. Sin la marca de orden de bytes (BOM), Excel abre el
//      fichero como ANSI y los acentos salen rotos: "Ramírez" -> "RamÃ­rez".
//   3. Las FÓRMULAS. Una celda que empieza por = + - @ la ejecuta Excel al
//      abrir. Y en Zalent los datos vienen de CVs que envía gente de fuera,
//      así que son contenido NO confiable (ver `neutralize` más abajo).

// Punto y coma: es lo que espera Excel en configuración española, que es el
// caso de uso declarado de Zalent (PYMEs de España).
const SEP = ";";

// La marca que le dice a Excel "esto es UTF-8". Sin ella, adiós a los acentos.
const BOM = "﻿";

// Impide la INYECCIÓN DE FÓRMULAS (CSV injection).
//
// Excel interpreta como fórmula cualquier celda que empiece por = + - @, tab o
// retorno de carro. Si un candidato pone `=HYPERLINK(...)` en su CV y ese texto
// acaba en una celda, Excel lo ejecuta al abrir el fichero.
//
// No es paranoia teórica en este producto: los CVs los escribe gente ajena a la
// empresa y llegan por correo. Es exactamente el escenario de "datos que no
// controlas" que hace peligrosa esta función de Excel.
//
// Se antepone un apóstrofo, que es la forma estándar de decirle a Excel "esto
// es texto literal"; el apóstrofo no se ve al abrirlo.
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

// Escapa un valor según las reglas del CSV (RFC 4180): si contiene el
// separador, comillas o saltos de línea, va entre comillas, y las comillas de
// dentro se duplican.
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = neutralize(String(value));
  if (s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Una columna: su título y cómo sacar el valor de una fila.
export interface Column<T> {
  header: string;
  value: (row: T) => unknown;
}

// Construye el CSV completo, listo para guardar.
export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(SEP)];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(SEP));
  }
  // Saltos de línea de Windows: es una app de escritorio para Windows y hay
  // programas viejos que no entienden el salto suelto de Unix.
  return BOM + lines.join("\r\n") + "\r\n";
}

// Nombre de fichero seguro y con fecha, para que dos exportaciones no se pisen
// y se sepa de cuándo es cada una sin abrirla.
export function exportFileName(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  // Fuera todo lo que Windows no admite en un nombre de fichero.
  const safe = prefix.replace(/[\\/:*?"<>|]/g, "-").trim() || "export";
  return `${safe}_${stamp}.csv`;
}
