import { type ReactNode } from "react";
import { RELEVANT_FLOOR, matchBand } from "../lib/display";

// Muestra el % de encaje de un resultado de búsqueda, o "Sin relación" si está
// por debajo del umbral (para no vender como match un parecido flojo).
export function MatchTag({ score }: { score: number }) {
  if (score < RELEVANT_FLOOR) {
    return (
      <span className="norel" title="Sin relación clara con la búsqueda">
        Sin relación
      </span>
    );
  }
  const band = matchBand(score);
  return (
    <span className={"match " + band.cls} title={band.label + " relevancia"}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

// Resalta (con <mark>) las palabras de la búsqueda dentro de un texto, para que
// se vea POR QUÉ un fragmento del CV encaja con lo buscado.
export function highlight(text: string, query: string): ReactNode[] {
  const terms = Array.from(
    new Set(
      query.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter((t) => t.length >= 3),
    ),
  );
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    terms.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
  );
}
