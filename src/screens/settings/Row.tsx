// Fila etiqueta → valor (estilo preferencias). Compartida por varias secciones.
export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-row">
      <span className="set-row__label">{label}</span>
      <span className="set-row__value">{value}</span>
    </div>
  );
}
