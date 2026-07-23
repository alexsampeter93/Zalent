import { getDb } from "../db";
import { embed } from "./embeddings";
import { norm, STOPWORDS } from "./search";
import { PREF_WEIGHT } from "./preference";
import { scoreAgainst, type ScoredChunk } from "./vectors";

const SEM_FLOOR = 0.3;
const SEM_TOP = 0.75;

export interface MatchResult {
  id: number;
  full_name: string | null;
  headline: string | null;
  source_file: string | null;
  fit: number; // encaje 0..1
  matched: string[]; // requisitos que SÍ cumple
  missing: string[]; // requisitos que le faltan (huecos)
  evidence: string; // fragmento del CV que respalda el encaje
}

// Sugerencia de "requisitos clave" a partir del texto de la oferta:
// las palabras significativas más frecuentes (el recruiter las edita).
export function deriveRequirements(offer: string, max = 8): string[] {
  const counts = new Map<string, number>();
  for (const w of norm(offer).split(" ")) {
    if (w.length >= 4 && !STOPWORDS.has(w)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map((e) => e[0]);
}

// Puntúa a todos los candidatos contra una oferta. Combina el encaje
// SEMÁNTICO de la oferta con la cobertura de los REQUISITOS clave, y
// devuelve para cada uno qué cumple, qué le falta y la evidencia.
export async function matchOffer(
  offer: string,
  requirements: string[],
): Promise<MatchResult[]> {
  const db = await getDb();
  const q = await embed(offer);

  // Mismo puente que la búsqueda: Rust compara la oferta contra cada fragmento
  // y calcula la afinidad con tus votos. Aquí solo llegan textos y números.
  const scoring = await scoreAgainst(q, norm);

  // La cobertura de requisitos sale del texto VIVO del candidato (raw_text
  // incluido), no del índice de fragmentos: ese índice es un caché derivado y
  // puede quedar desfasado/recortado, y entonces un requisito que SÍ está en el
  // CV no se marcaría como cumplido. Correción > ahorro. Ver Diario 55/59.
  const cands = await db.select<
    {
      id: number;
      full_name: string | null;
      headline: string | null;
      education: string | null;
      source_file: string | null;
      raw_text: string | null;
    }[]
  >(
    `SELECT id, full_name, headline, education, source_file, raw_text
       FROM candidates`,
  );

  // Requisitos: guardamos el original (para mostrar) y su versión normalizada.
  const reqs = requirements
    .map((r) => ({ display: r.trim(), key: norm(r) }))
    .filter((r) => r.key.length > 0);

  const results: MatchResult[] = cands.map((c) => {
    const chunks = scoring.byCand.get(c.id) ?? [];
    const semBest = chunks.reduce<ScoredChunk | undefined>(
      (best, ch) => (!best || ch.cos > best.cos ? ch : best),
      undefined,
    );
    const cos = semBest?.cos ?? 0;
    const calibSem = Math.min(1, Math.max(0, (cos - SEM_FLOOR) / (SEM_TOP - SEM_FLOOR)));

    // Léxica: un requisito se cumple si aparece (como texto) en el CV vivo.
    const candText = norm(
      [c.full_name, c.headline, c.education, c.raw_text].filter(Boolean).join(" "),
    );
    const matched: string[] = [];
    const missing: string[] = [];
    for (const r of reqs) {
      if (candText.includes(r.key)) matched.push(r.display);
      else missing.push(r.display);
    }
    const coverage = reqs.length > 0 ? matched.length / reqs.length : 0;

    // Encaje: si hay requisitos, mezcla significado + cobertura; si no, solo
    // significado. (Los umbrales/pesos son ajustables.)
    const boost = PREF_WEIGHT * scoring.affinity(c.id);
    const base = reqs.length > 0 ? 0.6 * calibSem + 0.4 * coverage : calibSem;
    const fit = Math.min(1, Math.max(0, base + boost));

    // Evidencia: preferimos un fragmento que contenga algún requisito cumplido.
    let evidenceChunk = semBest;
    if (matched.length > 0) {
      const withReq = chunks.filter((ch) =>
        matched.some((m) => ch.ntext.includes(norm(m))),
      );
      if (withReq.length > 0) {
        evidenceChunk = withReq.reduce((best, ch) => (ch.cos > best.cos ? ch : best));
      }
    }

    return {
      id: c.id,
      full_name: c.full_name,
      headline: c.headline,
      source_file: c.source_file,
      fit,
      matched,
      missing,
      evidence: evidenceChunk?.text ?? "",
    };
  });

  results.sort((a, b) => b.fit - a.fit);
  return results;
}
