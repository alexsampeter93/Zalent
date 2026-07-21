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
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [ms, setMs] = useState(0);
  const [copied, setCopied] = useState(false);

  async function check() {
    setChecking(true);
    try {
      setAvailable(await isModelReady());
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    // Se comprueba al abrir la ficha y OTRA VEZ a los 3 segundos si dio que no.
    // Motivo: el sidecar de Ollama tarda unos segundos en levantarse tras
    // abrir la app; si entras rápido en un candidato, la primera comprobación
    // sale negativa y sin reintento la tarjeta se quedaría muerta toda la
    // sesión aunque el modelo esté ahí. Ver Diario, entrada 53.
    let alive = true;
    let timer: number | undefined;
    isModelReady().then((ok) => {
      if (!alive) return;
      setAvailable(ok);
      if (!ok) {
        timer = window.setTimeout(() => {
          if (alive) isModelReady().then((r) => alive && setAvailable(r));
        }, 3000);
      }
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Mientras se comprueba por primera vez no pintamos nada: un parpadeo de
  // "no disponible" que se corrige solo confunde más que el silencio.
  if (available === null) return null;

  // Si la IA no está lista, la tarjeta SÍ aparece, explicando por qué y qué
  // hacer. Antes se ocultaba entera, y eso dejaba al usuario sin saber si
  // faltaba algo o si la app estaba rota — el mismo fallo de los errores
  // invisibles de la entrada 48, repetido aquí.
  if (available === false) {
    return (
      <section className="ai-assist ai-assist--off">
        <p className="card__title">Asistente IA</p>
        <p className="card__intro">
          Puede resumir el perfil, sugerir preguntas de entrevista y redactar un
          email de rechazo, todo en tu equipo. Necesita el{" "}
          <strong>modelo de IA local</strong>, que se descarga una sola vez
          desde <strong>Importar</strong> (unos 4,7 GB).
        </p>
        <div className="ai-assist__actions">
          <button className="btn-sm btn-ghost" onClick={check} disabled={checking}>
            {checking ? "Comprobando…" : "Comprobar de nuevo"}
          </button>
        </div>
      </section>
    );
  }

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
