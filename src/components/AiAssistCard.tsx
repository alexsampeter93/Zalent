import { useEffect, useState } from "react";
import type { CandidateDetail } from "../lib/candidates";
import { isModelReady, type GenerateResult } from "../lib/ai/ollama";
import {
  summarizeCandidate,
  interviewQuestions,
  rejectionEmail,
} from "../lib/ai/assist";
import { reportError } from "../lib/errors";

// Asistente de IA en la ficha del candidato: resumen, preguntas de entrevista y
// borrador de email de rechazo, con el LLM local (Ollama).
//
// Todo lo que genera es un BORRADOR editable, nunca un dato dado por cierto:
// por eso el resultado va en un textarea (se puede corregir antes de usarlo) y
// hay un aviso permanente de que lo ha escrito una IA. Ver Diario, entrada 51.

type Kind = "summary" | "interview" | "rejection";

const LABELS: Record<Kind, string> = {
  summary: "Resumen del perfil",
  interview: "Preguntas de entrevista",
  rejection: "Email de rechazo",
};

export function AiAssistCard({
  candidate,
  vacancyTitle,
}: {
  candidate: CandidateDetail;
  // Si el candidato está en una oferta, el email de rechazo la menciona.
  vacancyTitle?: string;
}) {
  // null = aún comprobando; el modelo tarda un momento en responder al arranque.
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [ms, setMs] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    isModelReady().then(setAvailable);
  }, []);

  // Si la IA no está lista, no ocupamos sitio con la tarjeta: es una función
  // opt-in y quien no la ha activado no debería ni verla a medias.
  if (available !== true) return null;

  async function run(k: Kind) {
    setBusy(k);
    setKind(k);
    setText("");
    setCopied(false);
    try {
      let res: GenerateResult;
      if (k === "summary") res = await summarizeCandidate(candidate);
      else if (k === "interview") res = await interviewQuestions(candidate);
      else res = await rejectionEmail(candidate, vacancyTitle);

      if (res.error) {
        reportError(`La IA no pudo generar «${LABELS[k]}»`, res.error);
        setKind(null);
        return;
      }
      setText(res.text);
      setMs(res.ms);
    } catch (e) {
      reportError(`La IA no pudo generar «${LABELS[k]}»`, e);
      setKind(null);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (e) {
      reportError("No se pudo copiar al portapapeles", e);
    }
  }

  return (
    <section className="ai-assist">
      <p className="card__title">Asistente IA</p>
      <p className="card__intro">
        Genera un borrador con la IA local (privada, en tu equipo). Puede tardar
        y <strong>puede equivocarse</strong>: revísalo antes de usarlo.
      </p>

      <div className="ai-assist__actions">
        {(Object.keys(LABELS) as Kind[]).map((k) => (
          <button
            key={k}
            className="btn-sm"
            onClick={() => run(k)}
            disabled={busy !== null}
          >
            {busy === k ? "Generando…" : LABELS[k]}
          </button>
        ))}
      </div>

      {busy !== null && (
        <p className="card__hint">
          Pensando… un modelo local por CPU puede tardar entre 10 y 40 segundos.
        </p>
      )}

      {kind !== null && text !== "" && (
        <div className="ai-assist__result">
          <div className="ai-assist__result-head">
            <span className="ai-assist__badge">
              {LABELS[kind]} · IA · {(ms / 1000).toFixed(0)}s
            </span>
            <button className="btn-sm btn-ghost" onClick={copy}>
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          {/* Editable: es un borrador. El email sobre todo se retoca antes de
              enviarlo, y nada de esto se guarda solo. */}
          <textarea
            className="ai-assist__text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            rows={kind === "summary" ? 5 : 9}
          />
        </div>
      )}
    </section>
  );
}
