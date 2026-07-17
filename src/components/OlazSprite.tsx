import { useEffect, useRef, useState } from "react";

// Reproductor de Olaz animado por frames numerados.
// Espera imágenes en: public/olaz/frames/<name>-01.png … <name>-NN.png
// (mismo tamaño de lienzo, transparente, Olaz registrado igual en cada frame).
//
// Uso:
//   <OlazSprite name="olaz-wave" frames={8} fps={10} width={96} />
//   <OlazSprite name="olaz-peek" frames={5} sequence={[3,3,3,4,5,4,3]} />

interface OlazSpriteProps {
  name: string; // base del nombre de archivo, p.ej. "olaz-peek"
  frames: number; // nº de frames disponibles (01..NN)
  fps?: number; // fotogramas por segundo (por defecto 10)
  // Se puede dar `width` o `height`. Para las animaciones de Olaz hay que
  // usar SIEMPRE `height`: al levantar el brazo el lienzo se ensancha, así
  // que ajustar por anchura encogería al personaje justo en ese frame. Lo
  // que no cambia nunca es cuánto mide de alto.
  width?: number;
  height?: number;
  loop?: boolean; // repetir en bucle (por defecto true)
  playOn?: "always" | "hover"; // cuándo se anima
  sequence?: number[]; // orden de reproducción (por defecto 1..frames)
  alt?: string;
  className?: string;
}

function frameSrc(name: string, i: number): string {
  return `/olaz/frames/${name}-${String(i).padStart(2, "0")}.png`;
}

export function OlazSprite({
  name,
  frames,
  fps = 10,
  width,
  height,
  loop = true,
  playOn = "always",
  sequence,
  alt = "Olaz",
  className,
}: OlazSpriteProps) {
  const seq =
    sequence && sequence.length
      ? sequence
      : Array.from({ length: frames }, (_, i) => i + 1);

  const [pos, setPos] = useState(0);
  const [hovering, setHovering] = useState(false);
  const timer = useRef<number | null>(null);

  // Respeta la preferencia de "menos movimiento" (accesibilidad).
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const active = !reduced && seq.length > 1 && (playOn === "always" || hovering);

  // Precarga los frames una vez (evita parpadeos en el primer bucle).
  useEffect(() => {
    for (let i = 1; i <= frames; i++) {
      const img = new Image();
      img.src = frameSrc(name, i);
    }
  }, [name, frames]);

  useEffect(() => {
    if (!active) return;
    timer.current = window.setInterval(() => {
      setPos((p) => {
        if (p + 1 >= seq.length) return loop ? 0 : p;
        return p + 1;
      });
    }, 1000 / fps);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // seq se recrea en cada render; dependemos de su longitud, no de la referencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, seq.length, fps, loop]);

  // Al dejar de animar en modo hover, vuelve al primer frame.
  useEffect(() => {
    if (playOn === "hover" && !hovering) setPos(0);
  }, [hovering, playOn]);

  const frame = seq[pos] ?? 1;
  // Tamaño: SIEMPRE por altura. Ajustar por anchura es imposible con este
  // personaje — al levantar el brazo el lienzo se ensancha, así que la misma
  // anchura lo encogería justo en ese frame. De alto mide siempre igual.
  //
  // Y si no se pasa ninguna medida, NO se inyecta estilo en línea: manda el
  // CSS de la clase. (Antes había un `width: 96` por defecto que pisaba
  // silenciosamente al CSS y dejaba a Olaz a 64px en vez de 114.)
  const size: React.CSSProperties = height
    ? { height, width: width ?? "auto" }
    : width
      ? { width, height: "auto" }
      : {};

  return (
    <img
      src={frameSrc(name, frame)}
      alt={alt}
      className={className}
      style={{ ...size, objectFit: "contain" }}
      draggable={false}
      onMouseEnter={playOn === "hover" ? () => setHovering(true) : undefined}
      onMouseLeave={playOn === "hover" ? () => setHovering(false) : undefined}
    />
  );
}
