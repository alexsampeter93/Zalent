import { useState } from "react";
import type { CandidateDetail } from "../../lib/candidates";
import {
  summarizeCandidate,
  interviewQuestions,
  rejectionEmail,
} from "../../lib/ai/assist";
import { reportError } from "../../lib/errors";

export type AiAssistKind = "summary" | "interview" | "rejection";

export const AI_ASSIST_LABELS: Record<AiAssistKind, string> = {
  summary: "Resumen del perfil",
  interview: "Preguntas de entrevista",
  rejection: "Email de rechazo",
};

interface AiAssistResult {
  kind: AiAssistKind | null;
  text: string;
  ms: number;
  busy: AiAssistKind | null;
}

const EMPTY: AiAssistResult = { kind: null, text: "", ms: 0, busy: null };

// Vive en App (como `useImport`), no dentro de `AiAssistCard`: así un
// resumen/pregunta/email en marcha sobrevive a cambiar de pantalla. Antes, al
// navegar mientras la IA trabajaba, el componente se desmontaba y el
// resultado se perdía justo cuando llegaba — el cálculo seguía en Rust, pero
// ya no había dónde entregarlo.
//
// Un resultado por candidato (Map por id): trabajar en el resumen de uno no
// pisa el de otro si vas cambiando de ficha con algo aún generándose.
export function useAiAssist() {
  const [byCandidate, setByCandidate] = useState<Map<number, AiAssistResult>>(
    new Map(),
  );

  function resultFor(candidateId: number): AiAssistResult {
    return byCandidate.get(candidateId) ?? EMPTY;
  }

  function patch(candidateId: number, changes: Partial<AiAssistResult>) {
    setByCandidate((prev) => {
      const next = new Map(prev);
      next.set(candidateId, { ...(next.get(candidateId) ?? EMPTY), ...changes });
      return next;
    });
  }

  async function run(
    candidate: CandidateDetail,
    kind: AiAssistKind,
    vacancyTitle?: string,
  ) {
    const id = candidate.id;
    patch(id, { kind, text: "", ms: 0, busy: kind });
    try {
      const res =
        kind === "summary"
          ? await summarizeCandidate(candidate)
          : kind === "interview"
            ? await interviewQuestions(candidate)
            : await rejectionEmail(candidate, vacancyTitle);

      if (res.error) {
        reportError(`La IA no pudo generar «${AI_ASSIST_LABELS[kind]}»`, res.error);
        patch(id, { kind: null, busy: null });
        return;
      }
      patch(id, { text: res.text, ms: res.ms, busy: null });
    } catch (e) {
      reportError(`La IA no pudo generar «${AI_ASSIST_LABELS[kind]}»`, e);
      patch(id, { kind: null, busy: null });
    }
  }

  function setText(candidateId: number, text: string) {
    patch(candidateId, { text });
  }

  return { resultFor, run, setText };
}

export type AiAssistState = ReturnType<typeof useAiAssist>;
