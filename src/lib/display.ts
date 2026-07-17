// Helpers de PRESENTACIÓN (formatear para mostrar), sin JSX ni estado. Los usa
// la pantalla de Candidatos y sus piezas. Puros → fáciles de testear.

// "2024-01-15 09:30:00" (UTC de SQLite) → fecha/hora local legible.
export function formatDateTime(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? sqlUtc : d.toLocaleString();
}

// "Ana García" → "AG" (para el avatar circular). "?" si no hay nombre.
export function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// Banda de relevancia a partir de la similitud (calibrada para este modelo;
// los umbrales son ajustables). Evita que un parecido bajo parezca un "match".
export const RELEVANT_FLOOR = 0.35;

export function matchBand(score: number): { label: string; cls: string } {
  if (score >= 0.6) return { label: "Alta", cls: "match--alta" };
  if (score >= RELEVANT_FLOOR) return { label: "Media", cls: "match--media" };
  return { label: "Baja", cls: "match--baja" };
}
