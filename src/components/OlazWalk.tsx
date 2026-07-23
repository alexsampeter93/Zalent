// Olaz caminando "de verdad": un rig de tres piezas recortadas de UNA sola
// imagen (el avatar). Al ser el mismo PNG, el color nunca cambia entre
// fotogramas — el problema del parpadeo desaparece por construcción.
//
//   - cuerpo (coco + brazos + corbata): capa de delante, fija.
//   - pierna izquierda / derecha: capas de detrás, giran desde la cadera
//     alternadas → el paso se lee como paso.
//
// El punto de giro (transform-origin) es la CADERA de cada pierna, medido a
// mano sobre la imagen (regla nº0 de la skill de sprites: medir, no confiar en
// el ojo). Ver Diario, entrada 54.

const BASE = "/olaz/frames";

export function OlazWalk({ height = 250 }: { height?: number }) {
  return (
    <div className="olaz-walk" style={{ height }}>
      {/* piernas detrás (z-index en CSS) */}
      <img
        className="olaz-walk__leg olaz-walk__leg--l"
        src={`${BASE}/olaz-walk-legL.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="olaz-walk__leg olaz-walk__leg--r"
        src={`${BASE}/olaz-walk-legR.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {/* cuerpo delante: tapa la unión de las caderas */}
      <img
        className="olaz-walk__body"
        src={`${BASE}/olaz-walk-body.png`}
        alt="Olaz caminando"
        draggable={false}
      />
    </div>
  );
}
