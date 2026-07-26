import { useEffect, useState } from "react";
import "./BrandSplash.css";

// "CocoBrain presenta", cada arranque: la firma del estudio antes de entrar
// en el producto (como los cartones de estudio en el cine).
//
// Clave de diseño: la animación NO empieza hasta que la imagen está
// descargada y decodificada. La primera versión duraba 650 ms fijos y la
// imagen (1,9 MB) no llegaba a tiempo — se veía un fondo crema vacío
// parpadeando. `decode()` espera a que el navegador la tenga lista para
// pintar, no solo descargada.
const SPLASH_SRC = "/olaz/Presentacion.png";
const PAPER_SRC = "/olaz/FondoZalent.png"; // el papel del fondo (vía CSS)
const HOLD_MS = 1850; // deja terminar el resplandor y el barrido, y respira
const OUT_MS = 520; // duración del fundido de salida
const MAX_WAIT_MS = 2500; // por si la imagen no carga: no bloquear el arranque

type Phase = "waiting" | "in" | "out";

export function BrandSplash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("waiting");

  useEffect(() => {
    // OJO: nada de guardar "ya arrancó" en un ref que sobreviva al desmontaje.
    // En desarrollo React monta → desmonta → vuelve a montar cada componente;
    // un ref así hacía que el SEGUNDO montaje saliera antes de programar nada,
    // y el splash se quedaba clavado tapando la pantalla del candado (no se
    // podía ni escribir la contraseña). El estado va aquí dentro: cada montaje
    // trae su propio `alive`/`ran`/temporizadores, y el anterior se limpia.
    let alive = true;
    let ran = false; // `run` puede llegar dos veces (decode + red de seguridad)
    const timers: number[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      if (!alive || ran) return;
      ran = true;
      if (reduced) {
        // Sin animación: un instante quieto y fuera.
        setPhase("in");
        timers.push(window.setTimeout(onDone, 700));
        return;
      }
      setPhase("in");
      timers.push(
        window.setTimeout(() => {
          if (!alive) return;
          setPhase("out");
          timers.push(window.setTimeout(onDone, OUT_MS));
        }, HOLD_MS),
      );
    };

    // Se espera al LOGO y al PAPEL del fondo: si arrancara con el papel a
    // medio cargar, el telón cambiaría de aspecto a mitad de la animación.
    const load = (src: string) => {
      const img = new Image();
      img.src = src;
      // decode() rechaza en algunos navegadores si la imagen ya está en caché;
      // el catch cubre eso y también un 404 — en ambos casos seguimos igual,
      // el splash nunca debe impedir que la app arranque.
      return img.decode().catch(() => undefined);
    };
    Promise.all([load(SPLASH_SRC), load(PAPER_SRC)]).then(run).catch(run);
    // Red de seguridad: si la decodificación se eterniza, seguimos.
    timers.push(window.setTimeout(run, MAX_WAIT_MS));

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [onDone]);

  // Pulsar lo salta. Es cortesía para quien abre la app diez veces al día, y
  // sobre todo una válvula de seguridad: pase lo que pase con los tiempos, el
  // usuario siempre puede quitarse el splash de encima.
  function skip() {
    setPhase("out");
    window.setTimeout(onDone, OUT_MS);
  }

  return (
    <div
      className={`brand-splash brand-splash--${phase}`}
      onClick={skip}
      role="presentation"
    >
      <div className="brand-splash__stage">
        <div className="brand-splash__halo" />
        <img src={SPLASH_SRC} alt="CocoBrain presenta" draggable={false} />
        <div className="brand-splash__sheen" />
      </div>
    </div>
  );
}
