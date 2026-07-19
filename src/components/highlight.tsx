import { type ReactNode } from "react";

// Resalta (con <mark>) las palabras de la búsqueda dentro de un texto, para que
// se vea POR QUÉ un fragmento del CV encaja con lo buscado.
//
// Vive en su propio fichero, separado de MatchTag: Vite recarga en caliente
// mejor cuando un fichero exporta SOLO componentes, y esto es una función
// auxiliar que devuelve JSX, no un componente.
export function highlight(text: string, query: string): ReactNode[] {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
        .filter((t) => t.length >= 3),
    ),
  );
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .map((part, i) =>
      terms.includes(part.toLowerCase()) ? (
        <mark key={i}>{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
}
