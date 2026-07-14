import { useEffect, useRef, useState, type ReactNode } from "react";
import { extractText } from "./lib/extract";
import { guessFields } from "./lib/parse";
import {
  saveCandidate,
  listCandidates,
  getCandidate,
  updateCandidate,
  updateCandidateStatus,
  deleteCandidate,
  STATUSES,
  type CandidateRow,
  type CandidateDetail,
} from "./lib/candidates";
import { addNote, listNotes, type Note } from "./lib/notes";
import { saveCvFile, openCvFile } from "./lib/files";
import { indexAllCandidates, search, type SearchHit } from "./lib/ai/search";
import { AppShell, ComingSoon, type Screen } from "./shell/AppShell";
import { Matching } from "./screens/Matching";
import { Pipeline } from "./screens/Pipeline";
import { Panel } from "./screens/Panel";
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
  full_name: "", email: "", phone: "", location: "", headline: "",
  years_experience: "", education: "", links: "", skills: "", languages: "",
};

function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

function formatDateTime(sqlUtc: string): string {
  const d = new Date(sqlUtc.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? sqlUtc : d.toLocaleString();
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

// Banda de relevancia a partir de la similitud (calibrada para este modelo;
// los umbrales son ajustables). Evita que un parecido bajo parezca un "match".
const RELEVANT_FLOOR = 0.35;
function matchBand(score: number): { label: string; cls: string } {
  if (score >= 0.6) return { label: "Alta", cls: "match--alta" };
  if (score >= RELEVANT_FLOOR) return { label: "Media", cls: "match--media" };
  return { label: "Baja", cls: "match--baja" };
}

// Resalta las palabras de la búsqueda dentro de un texto.
function highlight(text: string, query: string): ReactNode[] {
  const terms = Array.from(
    new Set(
      query.toLowerCase().split(/\s+/).map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter((t) => t.length >= 3),
    ),
  );
  if (terms.length === 0) return [text];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    terms.includes(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>,
  );
}

interface Row {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  source_file: string | null;
  match?: number;
}

function statusLabel(key: string): string {
  return STATUSES.find((s) => s.key === key)?.label ?? "Nuevo";
}

function App() {
  const [screen, setScreen] = useState<Screen>("candidatos");

  // Importación
  const [fileName, setFileName] = useState("");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [extractError, setExtractError] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [form, setForm] = useState<CandidateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchErrors, setBatchErrors] = useState<{ name: string; error: string }[]>([]);
  const [batchKey, setBatchKey] = useState(0);
  const [dragOver, setDragOver] = useState<null | "single" | "batch">(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // Candidatos + búsqueda
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Detalle / edición / notas
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<CandidateForm>(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    refreshCandidates();
  }, []);

  // Al volver a Candidatos, recargar por si cambió algo en otra pantalla
  // (p.ej. mover estados en el Pipeline).
  useEffect(() => {
    if (screen === "candidatos") refreshCandidates();
  }, [screen]);

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

  // ---- Búsqueda ----
  async function doSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim() === "") {
      clearSearch();
      return;
    }
    setSelectedId(null);
    setDetail(null);
    setSearching(true);
    try {
      setSearchStatus("Preparando (indexando CVs nuevos)…");
      await indexAllCandidates((d, t) => {
        if (t > 0) setSearchStatus(`Indexando candidatos: ${d} / ${t}…`);
      });
      setSearchStatus("Buscando por significado…");
      const r = await search(query.trim());
      setResults(r);
      setHasSearched(true);
      setSearchStatus("");
    } catch (err) {
      setSearchStatus("Error: " + String(err));
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setSearchStatus("");
  }

  // ---- Importación ----
  // ¿Es un CV admitido? (PDF o Word). Filtra lo que se suelte por arrastre.
  function isCvFile(f: File): boolean {
    return /\.(pdf|docx)$/i.test(f.name);
  }

  // Núcleo de "importar y revisar uno" (lo usan el botón y el arrastre).
  async function processSingleFile(file: File) {
    setFileName(file.name);
    setCurrentFile(file);
    setExtractedText("");
    setExtractError("");
    setSaveError("");
    setExtracting(true);
    try {
      const text = await extractText(file);
      setExtractedText(text);
      setForm({ ...emptyForm, ...guessFields(text, file.name) });
    } catch (err) {
      setExtractError(String(err));
    } finally {
      setExtracting(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processSingleFile(file);
  }

  // Núcleo del "importar en lote".
  async function processBatch(files: File[]) {
    if (files.length === 0) return;
    setBatchRunning(true);
    setBatchTotal(files.length);
    setBatchDone(0);
    setBatchErrors([]);
    const errors: { name: string; error: string }[] = [];
    for (const file of files) {
      try {
        const text = await extractText(file);
        const g = guessFields(text, file.name);
        let filePath: string | null = null;
        try {
          filePath = await saveCvFile(file);
        } catch (err) {
          console.error("save_cv:", err);
        }
        await saveCandidate({
          full_name: g.full_name, email: g.email, phone: g.phone,
          location: "", headline: "", years_experience: null, education: "",
          links: g.links, raw_text: text, source_file: file.name,
          file_path: filePath, skills: [], languages: [],
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

  async function onBatchChange(e: React.ChangeEvent<HTMLInputElement>) {
    await processBatch(Array.from(e.target.files ?? []).filter(isCvFile));
  }

  // Arrastre de archivos a las zonas de importación.
  function onDropFiles(
    e: React.DragEvent,
    mode: "single" | "batch",
  ) {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files).filter(isCvFile);
    if (files.length === 0) return;
    if (mode === "single") processSingleFile(files[0]);
    else processBatch(files);
  }

  async function onSave() {
    setSaving(true);
    setSaveError("");
    try {
      const raw = form.years_experience.trim().replace(",", ".");
      const years = raw === "" ? null : Number(raw);
      let filePath: string | null = null;
      if (currentFile) {
        try {
          filePath = await saveCvFile(currentFile);
        } catch (err) {
          console.error("save_cv:", err);
        }
      }
      await saveCandidate({
        full_name: form.full_name, email: form.email, phone: form.phone,
        location: form.location, headline: form.headline,
        years_experience: years !== null && !Number.isNaN(years) ? years : null,
        education: form.education, links: form.links,
        raw_text: extractedText, source_file: fileName,
        file_path: filePath,
        skills: splitList(form.skills), languages: splitList(form.languages),
      });
      setForm(emptyForm);
      setExtractedText("");
      setFileName("");
      setCurrentFile(null);
      setFileKey((k) => k + 1);
      await refreshCandidates();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---- Detalle / edición / notas / borrado ----
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

  function backToList() {
    setSelectedId(null);
    setDetail(null);
    setEditing(false);
    setConfirmingDelete(false);
  }

  function startEdit() {
    if (!detail) return;
    setEditForm({
      full_name: detail.full_name ?? "", email: detail.email ?? "",
      phone: detail.phone ?? "", location: detail.location ?? "",
      headline: detail.headline ?? "",
      years_experience: detail.years_experience?.toString() ?? "",
      education: detail.education ?? "", links: detail.links ?? "",
      skills: detail.skills.join(", "), languages: detail.languages.join(", "),
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
        full_name: editForm.full_name, email: editForm.email, phone: editForm.phone,
        location: editForm.location, headline: editForm.headline,
        years_experience: years !== null && !Number.isNaN(years) ? years : null,
        education: editForm.education, links: editForm.links,
        skills: splitList(editForm.skills), languages: splitList(editForm.languages),
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
      backToList();
      await refreshCandidates();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  }

  async function onStatusChange(status: string) {
    if (selectedId == null) return;
    try {
      await updateCandidateStatus(selectedId, status);
      setDetail(await getCandidate(selectedId));
      await refreshCandidates();
    } catch (e) {
      console.error(e);
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

  // Filas para tabla/lista: resultados de búsqueda o todos los candidatos.
  const searchMode = hasSearched && query.trim() !== "";
  const rows: Row[] = searchMode
    ? results.map((r) => ({
        id: r.id, full_name: r.full_name, email: r.email,
        headline: r.headline, source_file: r.source_file, match: r.score,
      }))
    : candidates.map((c) => ({
        id: c.id, full_name: c.full_name, email: c.email,
        headline: c.headline, source_file: c.source_file,
      }));
  const hitById = new Map(results.map((r) => [r.id, r]));
  const selectedHit = selectedId != null ? hitById.get(selectedId) : undefined;
  const statusById = new Map(candidates.map((c) => [c.id, c.status]));
  const relevantCount = searchMode
    ? results.filter((r) => r.score >= RELEVANT_FLOOR).length
    : 0;

  return (
    <AppShell active={screen} onNavigate={setScreen}>
      {screen === "candidatos" && (
        <div className="screen screen--wide screen--fill">
          <div className="screen__head">
            <h1 className="screen__title">Candidatos</h1>
            <p className="screen__sub">
              Busca por significado y haz clic para ver la ficha.
            </p>
          </div>

          <form className="searchbar" onSubmit={doSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Búsqueda semántica local… (p.ej. gestión de almacén y pedidos online)"
            />
            {query && (
              <button type="button" className="searchbar__clear" onClick={clearSearch} aria-label="Limpiar">
                ×
              </button>
            )}
            <button type="submit" disabled={searching}>
              {searching ? "…" : "Buscar"}
            </button>
          </form>
          {!searching && selectedId == null && rows.length > 0 && (
            searchMode ? (
              <div className="results-head">
                <img
                  src={`/olaz/${relevantCount > 0 ? "coco-thumbsup-cv" : "coco-thinking-cv"}.png`}
                  alt="Olaz"
                />
                <div>
                  <strong>
                    {relevantCount > 0
                      ? `Olaz encontró ${relevantCount} con relación`
                      : "Olaz no ve ningún candidato con relación"}
                  </strong>
                  <span>
                    {relevantCount > 0
                      ? `para «${query}», ordenados por encaje`
                      : `para «${query}» — quizá no tengas CVs de ese perfil`}
                  </span>
                </div>
              </div>
            ) : (
              <p className="screen__sub" style={{ margin: 0 }}>
                {rows.length} candidatos
              </p>
            )
          )}
          <div className="screen-scroll">
          {searching ? (
            <div className="search-loading">
              <img src="/olaz/coco-magnifier-cv.png" alt="Olaz buscando" />
              <p>{searchStatus || "Buscando por significado…"}</p>
            </div>
          ) : selectedId == null ? (
            /* ---------- Vista TABLA (3a) ---------- */
            rows.length === 0 ? (
              <div className="card">
                <p className="card__intro">
                  {searchMode
                    ? "Sin resultados. Prueba otra búsqueda."
                    : "Aún no hay candidatos. Ve a Importar para añadir CVs."}
                </p>
              </div>
            ) : (
              <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Candidato</th>
                        <th>Puesto</th>
                        {searchMode && <th className="col-match">Encaje</th>}
                        <th>Estado</th>
                        <th>Fuente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} onClick={() => selectCandidate(r.id)}>
                          <td>
                            <div className="cellname">
                              <span className="avatar">{initials(r.full_name)}</span>
                              <div>
                                <div className="cellname__name">
                                  {r.full_name || "(sin nombre)"}
                                </div>
                                <div className="cellname__sub">{r.email || "—"}</div>
                              </div>
                            </div>
                          </td>
                          <td>{r.headline || "—"}</td>
                          {searchMode && (
                            <td className="col-match">
                              {r.match != null ? <MatchTag score={r.match} /> : "—"}
                            </td>
                          )}
                          <td>
                            <span className={"badge st-" + (statusById.get(r.id) ?? "nuevo")}>
                              {statusLabel(statusById.get(r.id) ?? "nuevo")}
                            </span>
                          </td>
                          <td className="cell-muted">{r.source_file || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            )
          ) : (
            /* ---------- Vista MAESTRO-DETALLE (3b) ---------- */
            <div className="md">
              <aside className="md__list">
                <button className="backlink" onClick={backToList}>
                  ← Volver a la lista
                </button>
                {rows.map((r) => (
                  <button
                    key={r.id}
                    className={"md__row" + (selectedId === r.id ? " active" : "")}
                    onClick={() => selectCandidate(r.id)}
                  >
                    <span className="avatar">{initials(r.full_name)}</span>
                    <span className="md__row-name">
                      {r.full_name || "(sin nombre)"}
                    </span>
                    {r.match != null && r.match >= RELEVANT_FLOOR && (
                      <span className={"match match--sm " + matchBand(r.match).cls}>
                        {(r.match * 100).toFixed(0)}%
                      </span>
                    )}
                  </button>
                ))}
              </aside>

              <div className="md__detail">
                {detail && (
                  <section className="card">
                    <div className="detail-head">
                      <p className="card__title">
                        {detail.full_name || "(sin nombre)"}
                      </p>
                      {!editing && !confirmingDelete && (
                        <div className="detail-actions">
                          <button className="btn-secondary" onClick={startEdit}>
                            Editar
                          </button>
                          <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
                            Borrar
                          </button>
                        </div>
                      )}
                    </div>

                    {!editing && (
                      <div className="status-picker">
                        {STATUSES.map((s) => (
                          <button
                            key={s.key}
                            className={
                              "status-opt st-" + s.key +
                              (detail.status === s.key ? " is-current" : "")
                            }
                            onClick={() => onStatusChange(s.key)}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedHit && selectedHit.score >= RELEVANT_FLOOR && !editing &&
                      (selectedHit.why || selectedHit.evidence) && (
                        <div className="why">
                          <div className="why__h">
                            Por qué encaja · {(selectedHit.score * 100).toFixed(0)}%
                          </div>
                          {selectedHit.why && <p className="why__text">{selectedHit.why}</p>}
                          {selectedHit.evidence && (
                            <>
                              <div className="why__label">Fragmento del CV</div>
                              <p className="why__quote">
                                {highlight(selectedHit.evidence, query)}
                              </p>
                            </>
                          )}
                        </div>
                      )}

                    {confirmingDelete && (
                      <div className="confirm-delete">
                        <p className="confirm-delete__text">
                          ¿Borrar a <strong>{detail.full_name || "(sin nombre)"}</strong>{" "}
                          definitivamente? Se eliminarán su ficha, skills, idiomas y
                          notas. Esta acción no se puede deshacer.
                        </p>
                        <div className="actions">
                          <button className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
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
                          <button className="btn-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>
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
                        <Info label="Años de experiencia" value={detail.years_experience?.toString() ?? null} />
                        <Info label="Estudios" value={detail.education} />
                        <Info label="Enlaces" value={detail.links} />
                        <Info label="Skills" value={detail.skills.join(", ") || null} />
                        <Info label="Idiomas" value={detail.languages.join(", ") || null} />
                      </div>
                    )}

                    {!editing && (
                      <div className="cv-actions">
                        {detail.file_path ? (
                          <button
                            className="btn-secondary"
                            onClick={async () => {
                              try {
                                await openCvFile(detail.file_path!);
                              } catch (e) {
                                console.error("open cv:", e);
                              }
                            }}
                          >
                            📄 Ver CV original
                          </button>
                        ) : (
                          <span className="cv-actions__none">
                            (CV importado antes de guardar el archivo original)
                          </span>
                        )}
                        {detail.raw_text && (
                          <details className="raw-details">
                            <summary>Ver texto extraído</summary>
                            <textarea
                              className="cv-text"
                              readOnly
                              value={detail.raw_text}
                              rows={10}
                            />
                          </details>
                        )}
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
              </div>
            </div>
          )}
          </div>
        </div>
      )}

      {screen === "importar" && (
        <div className="screen">
          <div className="screen__head">
            <h1 className="screen__title">Importar</h1>
            <p className="screen__sub">
              Arrastra tus CVs y se convierten en fichas. Todo local, nada sale a la nube.
            </p>
          </div>

          {/* Zona de arrastre principal (lote) */}
          <label
            className={
              "dropzone" +
              (dragOver === "batch" ? " is-over" : "") +
              (batchRunning ? " is-busy" : "")
            }
            onDragOver={(e) => {
              e.preventDefault();
              if (!batchRunning) setDragOver("batch");
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => !batchRunning && onDropFiles(e, "batch")}
          >
            <input
              key={batchKey}
              type="file"
              multiple
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={onBatchChange}
              disabled={batchRunning}
              hidden
            />
            <img
              src="/olaz/coco-running-cv-papers.png"
              alt="Olaz"
              className="dropzone__olaz"
            />
            <div className="dropzone__title">Arrastra tus CVs aquí</div>
            <div className="dropzone__sub">
              o <span className="dropzone__link">haz clic para elegir</span>
              <span className="dropzone__dot">·</span> PDF o Word
              <span className="dropzone__dot">·</span> varios a la vez
            </div>
          </label>

          {/* Importar una carpeta entera (usa webkitdirectory) */}
          <button
            type="button"
            className="folder-btn"
            onClick={() => folderRef.current?.click()}
            disabled={batchRunning}
          >
            📁 …o importar una carpeta entera de CVs
          </button>
          <input
            ref={folderRef}
            type="file"
            multiple
            onChange={onBatchChange}
            hidden
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          />

          {/* Progreso del lote */}
          {batchRunning && (
            <div className="import-progress">
              <div className="import-progress__bar">
                <div
                  className="import-progress__fill"
                  style={{
                    width: `${batchTotal ? (batchDone / batchTotal) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="import-progress__label">
                Procesando {batchDone} / {batchTotal}…
              </div>
            </div>
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
                <li key={er.name}>{er.name}: {er.error}</li>
              ))}
            </ul>
          )}

          {/* Opción secundaria: importar uno y revisarlo */}
          <div className="import-alt">
            <span className="import-alt__text">
              ¿Prefieres revisar los datos antes de guardar?
            </span>
            <label
              className={"btn-file" + (dragOver === "single" ? " is-over" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("single");
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => onDropFiles(e, "single")}
            >
              <input
                key={fileKey}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={onFileChange}
                hidden
              />
              Importar uno y revisar
            </label>
          </div>
          {extracting && <p className="card__intro">Leyendo el documento…</p>}
          {extractError && <p className="db-error">Error: {extractError}</p>}

          {extractedText && (
            <section className="card">
              <p className="card__title">Revisar la ficha</p>
              <p className="card__intro">
                Auto-rellenado desde <strong>{fileName}</strong> (
                {extractedText.length} caracteres). Revisa y completa.
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
        </div>
      )}

      {screen === "vacantes" && <Matching />}
      {screen === "pipeline" && <Pipeline />}
      {screen === "panel" && <Panel />}
      {screen === "ajustes" && <ComingSoon title="Ajustes" pose="sleeping" />}
    </AppShell>
  );
}

function CandidateFieldsForm({
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

function Field({ label, children }: { label: string; children: ReactNode }) {
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

// Muestra el % de encaje, o "Sin relación" si está por debajo del umbral.
function MatchTag({ score }: { score: number }) {
  if (score < RELEVANT_FLOOR) {
    return (
      <span className="norel" title="Sin relación clara con la búsqueda">
        Sin relación
      </span>
    );
  }
  const band = matchBand(score);
  return (
    <span className={"match " + band.cls} title={band.label + " relevancia"}>
      {(score * 100).toFixed(0)}%
    </span>
  );
}

export default App;
