// Estado vacío reutilizable: Olaz + mensaje guía + acción opcional.
// Sirve para que las pantallas sin datos no se vean desangeladas, sino
// que inviten a dar el siguiente paso.

interface EmptyStateProps {
  image?: string; // pose de Olaz en /olaz/<image>.png
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  image = "coco-waving-cv",
  title,
  subtitle,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <img src={`/olaz/${image}.png`} alt="" aria-hidden="true" />
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
