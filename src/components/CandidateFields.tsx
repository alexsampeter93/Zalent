import { type ReactNode } from "react";
import type { CandidateForm } from "../lib/candidate-form";

// El formulario de campos de una ficha (nombre, email, skills…). Se reutiliza
// en DOS sitios: al revisar un CV recién importado y al editar una ficha ya
// guardada. Por eso vive aparte: misma pinta, mismos campos, un solo lugar.
export function CandidateFieldsForm({
  form,
  onChange,
}: {
  form: CandidateForm;
  onChange: <K extends keyof CandidateForm>(key: K, value: string) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="Nombre"><input value={form.full_name} onChange={(e) => onChange("full_name", e.target.value)} /></Field>
      <Field label="Email"><input value={form.email} onChange={(e) => onChange("email", e.target.value)} /></Field>
      <Field label="Teléfono"><input value={form.phone} onChange={(e) => onChange("phone", e.target.value)} /></Field>
      <Field label="Ubicación"><input value={form.location} onChange={(e) => onChange("location", e.target.value)} /></Field>
      <Field label="Último puesto / titular"><input value={form.headline} onChange={(e) => onChange("headline", e.target.value)} /></Field>
      <Field label="Años de experiencia"><input inputMode="decimal" value={form.years_experience} onChange={(e) => onChange("years_experience", e.target.value)} /></Field>
      <Field label="Estudios"><input value={form.education} onChange={(e) => onChange("education", e.target.value)} /></Field>
      <Field label="Enlaces (LinkedIn…)"><input value={form.links} onChange={(e) => onChange("links", e.target.value)} /></Field>
      <Field label="Skills (separadas por comas)"><input value={form.skills} onChange={(e) => onChange("skills", e.target.value)} /></Field>
      <Field label="Idiomas (separados por comas)"><input value={form.languages} onChange={(e) => onChange("languages", e.target.value)} /></Field>
    </div>
  );
}

// Un campo etiquetado del formulario (label arriba, control debajo).
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

// Un dato de solo lectura en la ficha (label + valor, con "—" si está vacío).
export function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="info">
      <span className="field__label">{label}</span>
      <span className="info__value">{value || "—"}</span>
    </div>
  );
}
