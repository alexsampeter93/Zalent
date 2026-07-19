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
