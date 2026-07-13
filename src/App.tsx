import { useEffect, useState } from "react";
import { extractText } from "./lib/extract";
import { guessFields } from "./lib/parse";
import {
  saveCandidate,
  listCandidates,
  getCandidate,
  updateCandidate,
  deleteCandidate,
  type CandidateRow,
  type CandidateDetail,
} from "./lib/candidates";
import { addNote, listNotes, type Note } from "./lib/notes";
import "./App.css";

interface CandidateForm {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  years_experience: string;
  education: string;
  links: string;
  skills: string;
  languages: string;
}

const emptyForm: CandidateForm = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  years_experience: "",
  education: "",
  links: "",
  skills: "",
  languages: "",
};

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// La BD guarda la fecha en UTC ("2026-07-13 10:48:06"). La mostramos en la
// hora local del usuario.
function formatDateTime(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? sqlUtc : d.toLocaleString();
}

function App() {
  // --- Importación / extracción ---
  const [fileName, setFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [extractError, setExtractError] = useState("");
  const [fileKey, setFileKey] = useState(0);

  // --- Formulario de la ficha ---
  const [form, setForm] = useState<CandidateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // --- Importación en lote (varios CVs de golpe) ---
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchErrors, setBatchErrors] = useState<
    { name: string; error: string }[]
  >([]);
  const [batchKey, setBatchKey] = useState(0);

  // --- Candidatos guardados y detalle ---
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);

  // --- Edición del candidato seleccionado ---
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<CandidateForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);

  // --- Borrado ---
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // --- Notas del candidato seleccionado ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    refreshCandidates();
  }, []);

  async function refreshCandidates() {
    try {
      setCandidates(await listCandidates());
    } catch (e) {
      console.error(e);
    }
  }

  function set<K extends keyof CandidateForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setExtractedText("");
    setExtractError("");
    setSaveError("");
    setExtracting(true);
    try {
      const text = await extractText(file);
      setExtractedText(text);
      setForm({ ...emptyForm, ...guessFields(text) });
    } catch (err) {
      setExtractError(String(err));
    } finally {
      setExtracting(false);
    }
  }

  // Procesa varios archivos en fila: extrae, detecta lo básico y auto-guarda.
  async function onBatchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setBatchRunning(true);
    setBatchTotal(files.length);
    setBatchDone(0);
    setBatchErrors([]);
    const errors: { name: string; error: string }[] = [];

    for (const file of files) {
      try {
        const text = await extractText(file);
        const g = guessFields(text);
        await saveCandidate({
          full_name: g.full_name,
          email: g.email,
          phone: g.phone,
          location: "",
          headline: "",
          years_experience: null,
          education: "",
          links: g.links,
          raw_text: text,
          source_file: file.name,
          skills: [],
          languages: [],
        });
      } catch (err) {
        errors.push({ name: file.name, error: String(err) });
      }
      setBatchDone((d) => d + 1);
    }

    setBatchErrors(errors);
    setBatchRunning(false);
    setBatchKey((k) => k + 1);
    await refreshCandidates();
  }

  async function onSave() {
    setSaving(true);
    setSaveError("");
    try {
      const raw = form.years_experience.trim().replace(",", ".");
      const years = raw === "" ? null : Number(raw);

      await saveCandidate({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        location: form.location,
        headline: form.headline,
        years_experience: years !== null && !Number.isNaN(years) ? years : null,
        education: form.education,
        links: form.links,
        raw_text: extractedText,
        source_file: fileName,
        skills: splitList(form.skills),
        languages: splitList(form.languages),
      });

      setForm(emptyForm);
      setExtractedText("");
      setFileName("");
      setFileKey((k) => k + 1);
      await refreshCandidates();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function selectCandidate(id: number) {
    setSelectedId(id);
    setNewNote("");
    setEditing(false);
    setConfirmingDelete(false);
    try {
      setDetail(await getCandidate(id));
      setNotes(await listNotes(id));
    } catch (e) {
      console.error(e);
    }
  }

  function startEdit() {
    if (!detail) return;
    setEditForm({
      full_name: detail.full_name ?? "",
      email: detail.email ?? "",
      phone: detail.phone ?? "",
      location: detail.location ?? "",
      headline: detail.headline ?? "",
      years_experience: detail.years_experience?.toString() ?? "",
      education: detail.education ?? "",
      links: detail.links ?? "",
      skills: detail.skills.join(", "),
      languages: detail.languages.join(", "),
    });
    setEditing(true);
  }

  function setEditField<K extends keyof CandidateForm>(key: K, value: string) {
    setEditForm((f) => ({ ...f, [key]: value }));
  }

  async function onUpdate() {
    if (selectedId == null) return;
    setSavingEdit(true);
    try {
      const raw = editForm.years_experience.trim().replace(",", ".");
      const years = raw === "" ? null : Number(raw);
      await updateCandidate(selectedId, {
        full_name: editForm.full_name,
        email: editForm.email,
        phone: editForm.phone,
        location: editForm.location,
        headline: editForm.headline,
        years_experience: years !== null && !Number.isNaN(years) ? years : null,
        education: editForm.education,
        links: editForm.links,
        skills: splitList(editForm.skills),
        languages: splitList(editForm.languages),
      });
      setEditing(false);
      setDetail(await getCandidate(selectedId));
      await refreshCandidates();
    } catch (e) {
      console.error(e);
    } finally {
      setSavingEdit(false);
    }
  }

  async function onDelete() {
    if (selectedId == null) return;
    setDeleting(true);
    try {
      await deleteCandidate(selectedId);
      setConfirmingDelete(false);
      setSelectedId(null);
      setDetail(null);
      await refreshCandidates();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  }

  async function onAddNote() {
    if (selectedId == null || newNote.trim() === "") return;
    setSavingNote(true);
    try {
      await addNote(selectedId, newNote.trim());
      setNewNote("");
      setNotes(await listNotes(selectedId));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <main className="container">
      <header className="hero">
        <h1 className="brand">Zalent</h1>
        <p className="tagline">Gestor de CVs y talento local-first con IA</p>
      </header>

      <section className="card">
        <p className="card__title">1 · Importar un CV y revisarlo (PDF o Word)</p>
        <input
          key={fileKey}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onFileChange}
        />
        {extracting && <p className="card__intro">Leyendo el documento…</p>}
        {extractError && <p className="db-error">Error: {extractError}</p>}
      </section>

      <section className="card">
        <p className="card__title">Importar varios a la vez (lote automático)</p>
        <p className="card__intro">
          Selecciona varios CVs: se guardan solos con lo que se detecte (nombre,
          email, teléfono, enlace) y el texto completo. El resto se completa
          luego.
        </p>
        <input
          key={batchKey}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onBatchChange}
          disabled={batchRunning}
        />
        {batchRunning && (
          <p className="card__intro">
            Procesando {batchDone} / {batchTotal}…
          </p>
        )}
        {!batchRunning && batchTotal > 0 && (
          <p className="db-ok">
            ✅ Importados {batchTotal - batchErrors.length} de {batchTotal}
            {batchErrors.length > 0 && ` · ${batchErrors.length} con error`}
          </p>
        )}
        {batchErrors.length > 0 && (
          <ul className="batch-errors">
            {batchErrors.map((er) => (
              <li key={er.name}>
                {er.name}: {er.error}
              </li>
            ))}
          </ul>
        )}
      </section>

      {extractedText && (
        <section className="card">
          <p className="card__title">2 · Revisar la ficha</p>
          <p className="card__intro">
            Auto-rellenado desde <strong>{fileName}</strong> (
            {extractedText.length} caracteres). Revisa y completa antes de
            guardar.
          </p>

          <CandidateFieldsForm form={form} onChange={set} />

          <div className="actions">
            <button onClick={onSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar candidato"}
            </button>
          </div>
          {saveError && <p className="db-error">Error: {saveError}</p>}

          <details className="raw-details">
            <summary>Ver texto extraído del CV</summary>
            <textarea className="cv-text" readOnly value={extractedText} rows={10} />
          </details>
        </section>
      )}

      <section className="card">
        <p className="card__title">Candidatos guardados ({candidates.length})</p>
        {candidates.length === 0 ? (
          <p className="card__intro">Aún no hay candidatos. Importa un CV.</p>
        ) : (
          <ul className="candidate-list">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  className={
                    "candidate-item" + (selectedId === c.id ? " is-selected" : "")
                  }
                  onClick={() => selectCandidate(c.id)}
                >
                  <span className="candidate-name">
                    {c.full_name || "(sin nombre)"}
                  </span>
                  <span className="candidate-meta">
                    {c.email || "—"} · {c.source_file || "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && (
        <section className="card">
          <div className="detail-head">
            <p className="card__title">{detail.full_name || "(sin nombre)"}</p>
            {!editing && !confirmingDelete && (
              <div className="detail-actions">
                <button className="btn-secondary" onClick={startEdit}>
                  Editar
                </button>
                <button
                  className="btn-danger"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Borrar
                </button>
              </div>
            )}
          </div>

          {confirmingDelete && (
            <div className="confirm-delete">
              <p className="confirm-delete__text">
                ¿Borrar a <strong>{detail.full_name || "(sin nombre)"}</strong>{" "}
                definitivamente? Se eliminarán su ficha, skills, idiomas y notas.
                Esta acción no se puede deshacer.
              </p>
              <div className="actions">
                <button
                  className="btn-secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button className="btn-danger" onClick={onDelete} disabled={deleting}>
                  {deleting ? "Borrando…" : "Sí, borrar"}
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <>
              <CandidateFieldsForm form={editForm} onChange={setEditField} />
              <div className="actions">
                <button
                  className="btn-secondary"
                  onClick={() => setEditing(false)}
                  disabled={savingEdit}
                >
                  Cancelar
                </button>
                <button onClick={onUpdate} disabled={savingEdit}>
                  {savingEdit ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </>
          ) : (
            <div className="detail-grid">
              <Info label="Email" value={detail.email} />
              <Info label="Teléfono" value={detail.phone} />
              <Info label="Ubicación" value={detail.location} />
              <Info label="Último puesto" value={detail.headline} />
              <Info
                label="Años de experiencia"
                value={detail.years_experience?.toString() ?? null}
              />
              <Info label="Estudios" value={detail.education} />
              <Info label="Enlaces" value={detail.links} />
              <Info label="Skills" value={detail.skills.join(", ") || null} />
              <Info label="Idiomas" value={detail.languages.join(", ") || null} />
            </div>
          )}

          <p className="card__title notes-title">Notas ({notes.length})</p>
          <div className="note-add">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Escribe una nota sobre este candidato…"
              rows={3}
            />
            <button onClick={onAddNote} disabled={savingNote || newNote.trim() === ""}>
              {savingNote ? "Añadiendo…" : "Añadir nota"}
            </button>
          </div>

          {notes.length === 0 ? (
            <p className="card__intro">Sin notas todavía.</p>
          ) : (
            <ul className="note-list">
              {notes.map((n) => (
                <li key={n.id} className="note-item">
                  <div className="note-date">{formatDateTime(n.created_at)}</div>
                  <div className="note-body">{n.body}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="foot">Fase 1 · Datos + Ingesta</footer>
    </main>
  );
}

// Formulario de campos de una ficha, reutilizado en "revisar" y en "editar".
function CandidateFieldsForm({
  form,
  onChange,
}: {
  form: CandidateForm;
  onChange: <K extends keyof CandidateForm>(key: K, value: string) => void;
}) {
  return (
    <div className="form-grid">
      <Field label="Nombre">
        <input value={form.full_name} onChange={(e) => onChange("full_name", e.target.value)} />
      </Field>
      <Field label="Email">
        <input value={form.email} onChange={(e) => onChange("email", e.target.value)} />
      </Field>
      <Field label="Teléfono">
        <input value={form.phone} onChange={(e) => onChange("phone", e.target.value)} />
      </Field>
      <Field label="Ubicación">
        <input value={form.location} onChange={(e) => onChange("location", e.target.value)} />
      </Field>
      <Field label="Último puesto / titular">
        <input value={form.headline} onChange={(e) => onChange("headline", e.target.value)} />
      </Field>
      <Field label="Años de experiencia">
        <input inputMode="decimal" value={form.years_experience} onChange={(e) => onChange("years_experience", e.target.value)} />
      </Field>
      <Field label="Estudios">
        <input value={form.education} onChange={(e) => onChange("education", e.target.value)} />
      </Field>
      <Field label="Enlaces (LinkedIn…)">
        <input value={form.links} onChange={(e) => onChange("links", e.target.value)} />
      </Field>
      <Field label="Skills (separadas por comas)">
        <input value={form.skills} onChange={(e) => onChange("skills", e.target.value)} />
      </Field>
      <Field label="Idiomas (separados por comas)">
        <input value={form.languages} onChange={(e) => onChange("languages", e.target.value)} />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="info">
      <span className="field__label">{label}</span>
      <span className="info__value">{value || "—"}</span>
    </div>
  );
}

export default App;
