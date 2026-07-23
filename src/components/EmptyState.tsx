// Estado vacío reutilizable: Olaz + mensaje guía + acción opcional.
// Sirve para que las pantallas sin datos no se vean desangeladas, sino
// que inviten a dar el siguiente paso.

import { OlazSprite } from "./OlazSprite";

interface EmptyStateProps {
  image?: string; // pose fija de Olaz en /olaz/<image>.png
  // Alternativa animada: frames en /olaz/frames/<name>-NN.png. Si se pasa,
  // manda sobre `image`.
  sprite?: { name: string; frames: number; fps?: number; sequence?: number[] };
  // Variante "peek": Olaz asomándose (imagen fija en /olaz/frames/<peek>.png).
  // Entra deslizándose y se balancea por CSS. Manda sobre `sprite` e `image`.
  peek?: string;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  image = "coco-waving-cv",
  sprite,
  peek,
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      {peek ? (
        <span className="empty-state__peek">
          <img src={`/olaz/frames/${peek}.png`} alt="" aria-hidden="true" />
        </span>
      ) : sprite ? (
        <OlazSprite
          name={sprite.name}
          frames={sprite.frames}
          fps={sprite.fps ?? 6}
          sequence={sprite.sequence}
          height={155}
          alt=""
        />
      ) : (
        <img src={`/olaz/${image}.png`} alt="" aria-hidden="true" />
      )}
      <h3 className="empty-state__title">{title}</h3>
      {subtitle && <p className="empty-state__sub">{subtitle}</p>}
      {action && (
        <button className="empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
