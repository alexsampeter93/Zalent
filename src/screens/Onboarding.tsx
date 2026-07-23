import { useEffect, useState } from "react";
import { OlazSprite } from "../components/OlazSprite";
import { OlazWalk } from "../components/OlazWalk";
import { markOnboardingSeen } from "../lib/onboarding";

// Primer arranque guiado, contado por Olaz como si te hablara.
//
// Idea: Olaz es el PRESENTADOR, no un adorno. Está de pie sobre un foco (no
// flota), se pasea, señala, y lo que dice aparece escribiéndose en un bocadillo.
// La vida la pone el personaje actuando, no efectos de luz. Tres pantallas:
// quién es, la privacidad (local de verdad, sin nube premium inventada) y cómo
// empezar. Ver Diario, entrada 54.

const TOTAL = 3;

// ¿El usuario pidió menos movimiento? Entonces nada de paseos ni de escribir
// letra a letra: el texto sale entero y Olaz se queda quieto.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

// Texto que se "escribe" carácter a carácter. Reinicia cuando cambia el texto
// (al pasar de pantalla). Con menos-movimiento, lo muestra entero de golpe.
function useTypewriter(text: string, cps = 42): { shown: string; done: boolean } {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(0);

  // El contador avanza con un temporizador y se reinicia al cambiar de texto.
  // Esto dispara el aviso `set-state-in-effect`, que el proyecto acepta a
  // conciencia para animaciones y cargas (ver Diario, entrada 43): aquí es
  // exactamente eso, sincronizar estado con un temporizador externo.
  useEffect(() => {
    if (reduced) {
      setN(text.length);
      return;
    }
    setN(0);
    const id = window.setInterval(() => {
      setN((v) => (v >= text.length ? v : v + 1));
    }, 1000 / cps);
    return () => window.clearInterval(id);
  }, [text, cps, reduced]);

  return { shown: text.slice(0, n), done: n >= text.length };
}

// Qué dice y hace Olaz en cada pantalla.
//
// IMPORTANTE sobre la animación: los sprites de "poses" (señalar, saludar) NO
// son un ciclo de animación, son 5 dibujos distintos del generador, con pose,
// tamaño y luz inconsistentes entre sí. Reproducirlos en secuencia hace que
// Olaz "salte" (lo que se veía como bugueado). Por eso NUNCA animamos entre
// frames de una hoja generada.
//
// El movimiento "de verdad" (caminar) sale de UNA sola imagen (`olaz-stand`,
// recortada del avatar) meciéndose por CSS: como es siempre el mismo PNG, el
// color no puede cambiar entre fotogramas. Es la técnica de "muñeco recortable"
// (rigging): el personaje redondo camina con un balanceo (waddle) mientras
// avanza, y así los pasos se leen como pasos, no como carrera. Las poses
// (señalar) se quedan quietas con una respiración suave. Ver Diario, entrada 54.
// Todas las pantallas usan la MISMA imagen de Olaz (el avatar, `olaz-stand`):
// así el tono es idéntico en las tres y no hay unas más oscuras que otras. En
// la de privacidad camina de verdad (rig de piernas); en las otras dos se queda
// quieto con una respiración suave.
const STEPS = [
  {
    walking: false,
    pose: "olaz-stand",
    bubble:
      "¡Hola! Soy Olaz. Ordeno tus CVs, encuentro a quien buscas y lo dejo todo aquí, en tu equipo.",
  },
  {
    walking: true,
    pose: "olaz-stand", // no se usa al caminar (rig de piernas)
    bubble:
      "Tranquilo con los datos: los CVs, las búsquedas y el matching se quedan en este ordenador. No los mando a ninguna nube.",
  },
  {
    walking: false,
    pose: "olaz-magnifier", // Olaz con lupa: encaja con "listos para buscar"
    bubble:
      "¿Empezamos? Arrástrame una carpeta con tus CVs y te los dejo listos para buscar en segundos.",
  },
] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const { shown, done } = useTypewriter(s.bubble);

  function finish() {
    markOnboardingSeen();
    onDone();
  }
  const next = () => (step < TOTAL - 1 ? setStep(step + 1) : finish());

  return (
    <div className="onb">
      <div className="onb__card">
        {/* Bocadillo: lo que Olaz "dice", escribiéndose. */}
        <div className="onb__bubble" aria-live="polite">
          <p className="onb__bubble-text">
            {shown}
            {!done && <span className="onb__caret" aria-hidden="true" />}
          </p>
        </div>

        {/* Escena: foco + suelo + Olaz (de pie, no flotando). */}
        <div className="onb__stage">
          <div className="onb__spot" aria-hidden="true" />
          <div className="onb__disc" aria-hidden="true" />
          <div className="onb__floor" aria-hidden="true" />
          <div
            className={
              "onb__walker " +
              (s.walking ? "onb__walker--walk" : "onb__walker--idle")
            }
          >
            {s.walking ? (
              // Caminar de verdad: rig de piernas que giran desde la cadera
              // (una sola imagen recortada → sin cambios de color).
              <OlazWalk key={step} height={250} />
            ) : (
              // Pose quieta: una sola imagen (avatar o lupa), respiración por CSS.
              <OlazSprite
                key={step}
                name={s.pose}
                frames={1}
                sequence={[1]}
                fps={12}
                height={250}
              />
            )}
          </div>
        </div>

        {/* Contenido de apoyo, distinto en cada paso, que aparece tras el texto. */}
        <div className="onb__extra" key={step}>
          {step === 0 && <WelcomeExtra revealed={done} />}
          {step === 1 && <PrivacyExtra revealed={done} />}
          {step === 2 && <ImportExtra revealed={done} />}
        </div>

        <div className="onb__nav">
          <div className="onb__dots" aria-hidden="true">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span
                key={i}
                className={"onb__dot" + (i === step ? " onb__dot--on" : "")}
              />
            ))}
          </div>
          <div className="onb__buttons">
            {step < TOTAL - 1 && (
              <button className="btn-ghost btn-sm" onClick={finish}>
                Saltar
              </button>
            )}
            <button onClick={next}>
              {step === 0 && "Empezar"}
              {step === 1 && "Entendido"}
              {step === 2 && "Empezar a usar Zalent"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Los extras aparecen SOLO cuando el bocadillo ha terminado de escribirse
// (`revealed`), para que Olaz "diga" primero y muestre después.
function WelcomeExtra({ revealed }: { revealed: boolean }) {
  return (
    <ul className={"onb__features" + (revealed ? " is-in" : "")}>
      <Feature title="Búsqueda por significado">
        Encuentra a quien encaja por lo que sabe hacer, no solo por las palabras
        exactas del CV.
      </Feature>
      <Feature title="Todo en tu equipo">
        Los CVs no salen a internet. La privacidad es de serie, no una opción.
      </Feature>
      <Feature title="Matching con tus ofertas">
        Pega una oferta y puntúo a tus candidatos y explico el encaje.
      </Feature>
    </ul>
  );
}

function PrivacyExtra({ revealed }: { revealed: boolean }) {
  return (
    <div className={"onb__stats" + (revealed ? " is-in" : "")}>
      <div className="onb__stat">
        <strong>100%</strong>
        <span>en tu equipo</span>
      </div>
      <div className="onb__stat">
        <strong>0</strong>
        <span>datos en la nube</span>
      </div>
    </div>
  );
}

function ImportExtra({ revealed }: { revealed: boolean }) {
  return (
    <p className={"onb__filetypes" + (revealed ? " is-in" : "")}>
      PDF · DOCX · o una carpeta entera
    </p>
  );
}

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="onb__feature">
      <span className="onb__feature-dot" aria-hidden="true" />
      <div>
        <p className="onb__feature-title">{title}</p>
        <p className="onb__feature-desc">{children}</p>
      </div>
    </li>
  );
}
