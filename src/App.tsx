import { useEffect, useRef, useState, type ReactNode } from "react";
import { extractText } from "./lib/extract";
import { guessFields } from "./lib/parse";
import {
  saveCandidate,
  listCandidates,
  listForClassification,
  cleanupOrphans,
  getCandidate,
  updateCandidate,
  deleteCandidate,
  anonymizeCandidate,
  STATUSES,
  type CandidateRow,
  type CandidateDetail,
} from "./lib/candidates";
import { suggestTags } from "./lib/ai/classify";
import { setVote, listVotes, type Vote } from "./lib/feedback";
import {
  addNote,
  listNotes,
  deleteNote,
  listCandidatesWithNotes,
  type Note,
} from "./lib/notes";
import { saveCvFile, openCvFile } from "./lib/files";
import { indexAllCandidates, search, type SearchHit } from "./lib/ai/search";
import {
  listVacancies,
  listAllMemberships,
  listCandidateVacancies,
  setCandidateStage,
  addCandidateToVacancy,
} from "./lib/vacancies";
import {
  addTag,
  removeTag,
  listCandidateTags,
  listAllTags,
  listAllTagAssignments,
} from "./lib/tags";
import { AppShell, type Screen } from "./shell/AppShell";
import { Settings } from "./screens/Settings";
import { Vacancies } from "./screens/Vacancies";
import { Pipeline } from "./screens/Pipeline";
import { Panel } from "./screens/Panel";
import { OlazSprite } from "./components/OlazSprite";
import { EmptyState } from "./components/EmptyState";
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
  const [showBatchMsg, setShowBatchMsg] = useState(false);
  const [importReminder, setImportReminder] = useState(false);
  const [showCandReminder, setShowCandReminder] = useState(false);
  const [dragOver, setDragOver] = useState<null | "single" | "batch">(null);
  const folderRef = useRef<HTMLInputElement>(null);

  // Filtros de la tabla de Candidatos
  const [filterVacancy, setFilterVacancy] = useState<number | "all">("all");
  const [filterMissing, setFilterMissing] = useState<"none" | "email" | "name">("none");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [filterNotes, setFilterNotes] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<"recientes" | "antiguos" | "az" | "za">(
    "recientes",
  );
  const [vacancyList, setVacancyList] = useState<{ id: number; title: string }[]>([]);
  const [membership, setMembership] = useState<Map<number, Set<number>>>(new Map());
  const [notedIds, setNotedIds] = useState<Set<number>>(new Set());
  const [votes, setVotes] = useState<Map<number, number>>(new Map());
  // Selección múltiple y acciones en lote
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagByCandidate, setTagByCandidate] = useState<Map<number, Set<string>>>(new Map());

  // Etiquetas del candidato seleccionado (en su ficha).
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  // Ofertas del candidato seleccionado (con su fase en cada una).
  const [candOffers, setCandOffers] = useState<
    { id: number; title: string; stage: string }[]
  >([]);
  const [classifying, setClassifying] = useState(false);
  const [classifyMsg, setClassifyMsg] = useState("");

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
  const [confirmingAnon, setConfirmingAnon] = useState(false);
  const [anonymizing, setAnonymizing] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    (async () => {
      await cleanupOrphans(); // limpia huérfanos de borrados antiguos
      await refreshCandidates();
      await refreshFilters();
    })();
  }, []);

  // Al volver a Candidatos, recargar por si cambió algo en otra pantalla
  // (p.ej. asignar a ofertas o mover fases en el Pipeline).
  useEffect(() => {
    if (screen === "candidatos") {
      refreshCandidates();
      refreshFilters();
    }
  }, [screen]);

  // El mensaje "Importados X de Y" se muestra un momento y se desvanece.
  useEffect(() => {
    if (!showBatchMsg) return;
    const t = setTimeout(() => setShowBatchMsg(false), 4500);
    return () => clearTimeout(t);
  }, [showBatchMsg]);

  // El aviso "sin clasificar" solo vive en Importar, tras importar.
  useEffect(() => {
    if (screen !== "importar") setImportReminder(false);
  }, [screen]);

  // Recordatorio flotante en Candidatos: aparece al entrar y se va solo.
  useEffect(() => {
    if (screen !== "candidatos") {
      setShowCandReminder(false);
      return;
    }
    setShowCandReminder(true);
    const t = setTimeout(() => setShowCandReminder(false), 6500);
    return () => clearTimeout(t);
  }, [screen]);

  // Clasifica automáticamente TODA la base (para los CVs ya importados).
  async function onAutoClassify() {
    setClassifying(true);
    setClassifyMsg("");
    try {
      const all = await listForClassification();
      let tagged = 0;
      for (const c of all) {
        const suggested = suggestTags(c.raw_text ?? "", c.years_experience);
        for (const tag of suggested) await addTag(c.id, tag);
        if (suggested.length > 0) tagged++;
      }
      await refreshFilters();
      if (selectedId != null) setTags(await listCandidateTags(selectedId));
      setImportReminder(false);
      setClassifyMsg(`Clasificados ${tagged} de ${all.length} CVs`);
    } catch (e) {
      console.error(e);
      setClassifyMsg("Error al clasificar");
    } finally {
      setClassifying(false);
    }
  }

  // Trae las ofertas (para el desplegable) y el mapa candidato→ofertas.
  async function refreshFilters() {
    try {
      const [vs, ms, allT, tagAssigns, noted, voteRows] = await Promise.all([
        listVacancies(),
        listAllMemberships(),
        listAllTags(),
        listAllTagAssignments(),
        listCandidatesWithNotes(),
        listVotes(),
      ]);
      setNotedIds(new Set(noted));
      setVotes(new Map(voteRows.map((v) => [v.candidate_id, v.vote])));
      setVacancyList(vs.map((v) => ({ id: v.id, title: v.title })));
      const map = new Map<number, Set<number>>();
      for (const m of ms) {
        const set = map.get(m.candidate_id) ?? new Set<number>();
        set.add(m.vacancy_id);
        map.set(m.candidate_id, set);
      }
      setMembership(map);
      setAllTags(allT);
      const tmap = new Map<number, Set<string>>();
      for (const t of tagAssigns) {
        const set = tmap.get(t.candidate_id) ?? new Set<string>();
        set.add(t.tag);
        tmap.set(t.candidate_id, set);
      }
      setTagByCandidate(tmap);
    } catch (e) {
      console.error(e);
    }
  }

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
    setShowBatchMsg(true);
    setImportReminder(true);
    await refreshCandidates();
    await refreshFilters();
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
      const cleanYears = years !== null && !Number.isNaN(years) ? years : null;
      await saveCandidate({
        full_name: form.full_name, email: form.email, phone: form.phone,
        location: form.location, headline: form.headline,
        years_experience: cleanYears,
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
      await refreshFilters();
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
    setConfirmingAnon(false);
    setTagInput("");
    try {
      setDetail(await getCandidate(id));
      setNotes(await listNotes(id));
      setTags(await listCandidateTags(id));
      setCandOffers(await listCandidateVacancies(id));
    } catch (e) {
      console.error(e);
    }
  }

  // Añadir/quitar etiquetas del candidato abierto.
  async function onAddTag(raw: string) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t || selectedId == null || tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags((cur) => [...cur, t]);
    setTagInput("");
    try {
      await addTag(selectedId, t);
      await refreshFilters();
    } catch (e) {
      console.error(e);
    }
  }
  async function onRemoveTag(t: string) {
    if (selectedId == null) return;
    setTags((cur) => cur.filter((x) => x !== t));
    try {
      await removeTag(selectedId, t);
      await refreshFilters();
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

  async function onAnonymize() {
    if (selectedId == null) return;
    setAnonymizing(true);
    try {
      await anonymizeCandidate(selectedId);
      setDetail(await getCandidate(selectedId));
      setConfirmingAnon(false);
      await refreshCandidates();
      await refreshFilters();
    } catch (e) {
      console.error(e);
    } finally {
      setAnonymizing(false);
    }
  }

  // Cambia la fase del candidato DENTRO de una oferta (desde su ficha).
  async function onOfferStageChange(vacancyId: number, stage: string) {
    if (selectedId == null) return;
    setCandOffers((cur) =>
      cur.map((o) => (o.id === vacancyId ? { ...o, stage } : o)),
    );
    try {
      await setCandidateStage(selectedId, vacancyId, stage);
    } catch (e) {
      console.error(e);
      setCandOffers(await listCandidateVacancies(selectedId));
    }
  }

  async function onAddNote() {
    if (selectedId == null || newNote.trim() === "") return;
    setSavingNote(true);
    try {
      await addNote(selectedId, newNote.trim());
      setNewNote("");
      setNotes(await listNotes(selectedId));
      await refreshFilters(); // actualiza el filtro "con/sin notas"
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  }

  async function onDeleteNote(id: number) {
    if (selectedId == null) return;
    try {
      await deleteNote(id);
      setNotes(await listNotes(selectedId));
      await refreshFilters();
    } catch (e) {
      console.error(e);
    }
  }

  // Voto 👍/👎 del candidato abierto (pulsar el mismo voto lo quita).
  async function onVote(vote: Vote) {
    if (selectedId == null) return;
    const id = selectedId;
    const next: Vote | null = votes.get(id) === vote ? null : vote;
    setVotes((m) => {
      const n = new Map(m);
      if (next === null) n.delete(id);
      else n.set(id, next);
      return n;
    });
    try {
      await setVote(id, next);
    } catch (e) {
      console.error(e);
      await refreshFilters();
    }
  }

  // ---- Selección múltiple / acciones en lote ----
  function toggleSelect(id: number) {
    setSelectedIds((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleSelectAll(ids: number[]) {
    setSelectedIds((cur) => {
      const allSelected = ids.length > 0 && ids.every((id) => cur.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }
  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }
  async function onBulkDelete() {
    setBulkDeleting(true);
    try {
      for (const id of selectedIds) await deleteCandidate(id);
      if (selectedId != null && selectedIds.has(selectedId)) backToList();
      await refreshCandidates();
      await refreshFilters();
      exitSelection();
    } catch (e) {
      console.error(e);
    } finally {
      setBulkDeleting(false);
    }
  }
  async function onBulkAddToVacancy(vacancyId: number) {
    try {
      for (const id of selectedIds) await addCandidateToVacancy(id, vacancyId);
      await refreshCandidates();
      await refreshFilters();
      exitSelection();
    } catch (e) {
      console.error(e);
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
  // Aplica los filtros (oferta, datos faltantes, etiqueta, notas) a las filas.
  const filtersActive =
    filterVacancy !== "all" ||
    filterMissing !== "none" ||
    filterTag !== "all" ||
    filterNotes !== "all";
  const filteredRows = rows.filter((r) => {
    if (filterVacancy !== "all") {
      const set = membership.get(r.id);
      if (!set || !set.has(filterVacancy)) return false;
    }
    if (filterTag !== "all") {
      const set = tagByCandidate.get(r.id);
      if (!set || !set.has(filterTag)) return false;
    }
    if (filterMissing === "email" && r.email && r.email.trim()) return false;
    if (filterMissing === "name" && r.full_name && r.full_name.trim()) return false;
    if (filterNotes === "with" && !notedIds.has(r.id)) return false;
    if (filterNotes === "without" && notedIds.has(r.id)) return false;
    return true;
  });
  // Orden. En búsqueda con orden por defecto respetamos la relevancia.
  const nameOf = (r: Row) => (r.full_name || "￿").toLowerCase();
  const visibleRows =
    searchMode && sortBy === "recientes"
      ? filteredRows
      : [...filteredRows].sort((a, b) => {
          if (sortBy === "az") return nameOf(a).localeCompare(nameOf(b));
          if (sortBy === "za") return nameOf(b).localeCompare(nameOf(a));
          if (sortBy === "antiguos") return a.id - b.id;
          return b.id - a.id; // recientes
        });

  const hitById = new Map(results.map((r) => [r.id, r]));
  const selectedHit = selectedId != null ? hitById.get(selectedId) : undefined;
  const relevantCount = searchMode
    ? results.filter((r) => r.score >= RELEVANT_FLOOR).length
    : 0;
  // Candidatos sin ninguna etiqueta (para el aviso "sin clasificar").
  const unclassifiedCount = candidates.filter(
    (c) => !tagByCandidate.get(c.id)?.size,
  ).length;

  return (
    <AppShell active={screen} onNavigate={setScreen}>
      {screen === "candidatos" && (
        <div className="screen screen--wide screen--fill">
          {showCandReminder && unclassifiedCount > 0 && (
            <div className="cand-toast" key={unclassifiedCount}>
              <img src="/olaz/coco-thinking-cv.png" alt="" aria-hidden="true" />
              <span>
                Recuerda: tienes <strong>{unclassifiedCount}</strong>{" "}
                {unclassifiedCount === 1 ? "CV" : "CVs"} sin clasificar.
              </span>
            </div>
          )}
          <div className="screen__head">
            <h1 className="screen__title">Candidatos</h1>
            <p className="screen__sub">
              Busca por significado y haz clic para ver la ficha.
            </p>
          </div>

          <form className="searchbar" onSubmit={doSearch}>
            <OlazSprite
              className="olaz-perch"
              name="olaz-peek"
              frames={5}
              fps={8}
              width={116}
              height={91}
              sequence={[
                3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1, 2, 3, 3, 3, 3, 3, 3,
                3, 3, 3, 3, 3, 3, 4, 5, 5, 4,
              ]}
              alt=""
            />
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
                {filtersActive
                  ? `${visibleRows.length} de ${rows.length} candidatos`
                  : `${rows.length} candidatos`}
              </p>
            )
          )}
          {!searching && selectedId == null && rows.length > 0 && (
            <div className="filters">
              <select
                value={filterVacancy === "all" ? "all" : String(filterVacancy)}
                onChange={(e) =>
                  setFilterVacancy(
                    e.target.value === "all" ? "all" : Number(e.target.value),
                  )
                }
              >
                <option value="all">Todas las ofertas</option>
                {vacancyList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
              {allTags.length > 0 && (
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                >
                  <option value="all">Todas las etiquetas</option>
                  {allTags.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={filterMissing}
                onChange={(e) =>
                  setFilterMissing(e.target.value as "none" | "email" | "name")
                }
              >
                <option value="none">Todos los datos</option>
                <option value="name">Sin nombre</option>
                <option value="email">Sin email</option>
              </select>
              <select
                value={filterNotes}
                onChange={(e) =>
                  setFilterNotes(e.target.value as "all" | "with" | "without")
                }
              >
                <option value="all">Notas: todas</option>
                <option value="with">Con notas</option>
                <option value="without">Sin notas</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as "recientes" | "antiguos" | "az" | "za",
                  )
                }
                title="Ordenar"
              >
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
                <option value="az">Nombre A–Z</option>
                <option value="za">Nombre Z–A</option>
              </select>
              {filtersActive && (
                <button
                  className="btn-sm btn-ghost"
                  onClick={() => {
                    setFilterVacancy("all");
                    setFilterMissing("none");
                    setFilterTag("all");
                    setFilterNotes("all");
                  }}
                >
                  Limpiar filtros
                </button>
              )}
              <div className="filters__spacer" />
              <button
                className={"btn-sm" + (selectionMode ? " btn-ghost" : "")}
                onClick={() =>
                  selectionMode ? exitSelection() : setSelectionMode(true)
                }
              >
                {selectionMode ? "Cancelar selección" : "Seleccionar"}
              </button>
              <button
                className="btn-sm classify-btn"
                onClick={onAutoClassify}
                disabled={classifying}
                title="Detecta idiomas, carnets, estudios y experiencia de cada CV"
              >
                {classifying ? "Clasificando…" : "✨ Clasificar automáticamente"}
              </button>
              {classifyMsg && <span className="classify-msg">{classifyMsg}</span>}
            </div>
          )}

          {selectionMode && !searching && selectedId == null && (
            <div className="bulk-bar">
              <label className="bulk-bar__all">
                <input
                  type="checkbox"
                  checked={
                    visibleRows.length > 0 &&
                    visibleRows.every((r) => selectedIds.has(r.id))
                  }
                  onChange={() => toggleSelectAll(visibleRows.map((r) => r.id))}
                />
                Todos
              </label>
              <span className="bulk-bar__count">
                {selectedIds.size} seleccionados
              </span>
              <div className="filters__spacer" />
              <select
                className="btn-sm"
                value=""
                disabled={selectedIds.size === 0 || vacancyList.length === 0}
                onChange={(e) => {
                  if (e.target.value) onBulkAddToVacancy(Number(e.target.value));
                }}
              >
                <option value="">＋ Añadir a oferta…</option>
                {vacancyList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
              </select>
              {confirmBulkDelete ? (
                <>
                  <span className="bulk-bar__confirm">
                    ¿Eliminar {selectedIds.size}? (borra sus CVs)
                  </span>
                  <button
                    className="btn-sm btn-danger"
                    onClick={onBulkDelete}
                    disabled={bulkDeleting}
                  >
                    {bulkDeleting ? "Eliminando…" : "Sí, eliminar"}
                  </button>
                  <button
                    className="btn-sm btn-ghost"
                    onClick={() => setConfirmBulkDelete(false)}
                  >
                    No
                  </button>
                </>
              ) : (
                <button
                  className="btn-sm btn-danger-ghost"
                  onClick={() => setConfirmBulkDelete(true)}
                  disabled={selectedIds.size === 0}
                >
                  Eliminar
                </button>
              )}
            </div>
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
              searchMode ? (
                <div className="card">
                  <p className="card__intro">Sin resultados. Prueba otra búsqueda.</p>
                </div>
              ) : (
                <EmptyState
                  image="coco-magnifier-cv"
                  title="Aún no hay candidatos"
                  subtitle="Arrastra tus CVs (PDF o Word) y Zalent los convierte en fichas que puedes buscar por significado."
                  action={{
                    label: "Ir a Importar",
                    onClick: () => setScreen("importar"),
                  }}
                />
              )
            ) : visibleRows.length === 0 ? (
              <div className="card">
                <p className="card__intro">Ningún candidato con estos filtros.</p>
              </div>
            ) : (
              <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        {selectionMode && <th className="col-check"></th>}
                        <th>Candidato</th>
                        <th>Puesto</th>
                        {searchMode && <th className="col-match">Encaje</th>}
                        <th>Ofertas</th>
                        <th>Fuente</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => (
                        <tr
                          key={r.id}
                          className={
                            selectionMode && selectedIds.has(r.id)
                              ? "is-selected"
                              : undefined
                          }
                          onClick={() =>
                            selectionMode
                              ? toggleSelect(r.id)
                              : selectCandidate(r.id)
                          }
                        >
                          {selectionMode && (
                            <td className="col-check">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(r.id)}
                                onChange={() => toggleSelect(r.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </td>
                          )}
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
                            {membership.get(r.id)?.size ? (
                              <span className="offers-count">
                                {membership.get(r.id)!.size}
                              </span>
                            ) : (
                              <span className="cell-muted">—</span>
                            )}
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
                      {!editing && !confirmingDelete && !confirmingAnon && (
                        <div className="detail-actions">
                          <button className="btn-secondary" onClick={startEdit}>
                            Editar
                          </button>
                          {detail.full_name !== "[anonimizado]" && (
                            <button
                              className="btn-secondary"
                              onClick={() => setConfirmingAnon(true)}
                              title="Quitar datos personales (RGPD), conservando lo agregado"
                            >
                              Anonimizar
                            </button>
                          )}
                          <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
                            Borrar
                          </button>
                        </div>
                      )}
                    </div>

                    {confirmingAnon && (
                      <div className="confirm-delete confirm-anon">
                        <p className="confirm-delete__text">
                          ¿Anonimizar a{" "}
                          <strong>{detail.full_name || "(sin nombre)"}</strong>? Se
                          quitan nombre, email, teléfono, ubicación, enlaces, el
                          texto y el archivo del CV. Se conservan puesto, skills,
                          años, etiquetas y su sitio en el pipeline.{" "}
                          <strong>No se puede deshacer.</strong>
                        </p>
                        <div className="actions">
                          <button
                            className="btn-secondary"
                            onClick={() => setConfirmingAnon(false)}
                            disabled={anonymizing}
                          >
                            Cancelar
                          </button>
                          <button onClick={onAnonymize} disabled={anonymizing}>
                            {anonymizing ? "Anonimizando…" : "Sí, anonimizar"}
                          </button>
                        </div>
                      </div>
                    )}

                    {!editing && (
                      <div className="offers-box">
                        <div className="offers-box__label">
                          Ofertas ({candOffers.length})
                        </div>
                        {candOffers.length === 0 ? (
                          <p className="offers-box__empty">
                            No está en ninguna oferta. Asígnalo desde{" "}
                            <strong>Vacantes</strong>.
                          </p>
                        ) : (
                          <ul className="offers-list">
                            {candOffers.map((o) => (
                              <li key={o.id} className="offers-row">
                                <span className="offers-row__title">{o.title}</span>
                                <select
                                  className={"stage-select st-" + o.stage}
                                  value={o.stage}
                                  onChange={(e) =>
                                    onOfferStageChange(o.id, e.target.value)
                                  }
                                >
                                  {STATUSES.map((s) => (
                                    <option key={s.key} value={s.key}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {!editing && (
                      <div className="vote-box">
                        <span className="vote-box__label">¿Encaja este perfil?</span>
                        <div className="vote-btns">
                          <button
                            className={
                              "vote-btn vote-up" +
                              (votes.get(selectedId ?? -1) === 1 ? " is-on" : "")
                            }
                            onClick={() => onVote(1)}
                            title="Me encaja (subirá perfiles parecidos)"
                          >
                            👍
                          </button>
                          <button
                            className={
                              "vote-btn vote-down" +
                              (votes.get(selectedId ?? -1) === -1 ? " is-on" : "")
                            }
                            onClick={() => onVote(-1)}
                            title="No me encaja (bajará perfiles parecidos)"
                          >
                            👎
                          </button>
                        </div>
                      </div>
                    )}

                    {!editing && (
                      <div className="tags-box">
                        <div className="tags-box__label">Etiquetas</div>
                        <div className="tags-row">
                          {tags.map((t) => (
                            <span key={t} className="tag-chip">
                              {t}
                              <button
                                className="tag-chip__x"
                                onClick={() => onRemoveTag(t)}
                                aria-label={`Quitar ${t}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {tags.length === 0 && (
                            <span className="tags-empty">Sin etiquetas todavía</span>
                          )}
                        </div>
                        <input
                          className="tag-input"
                          list="tag-suggestions"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onAddTag(tagInput);
                            }
                          }}
                          placeholder="Añadir etiqueta (p.ej. carnet C+E) y Enter"
                        />
                        <datalist id="tag-suggestions">
                          {allTags.map((t) => (
                            <option key={t} value={t} />
                          ))}
                        </datalist>
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
                            <div className="note-item__head">
                              <span className="note-date">{formatDateTime(n.created_at)}</span>
                              <button
                                className="note-del"
                                onClick={() => onDeleteNote(n.id)}
                                title="Eliminar nota"
                                aria-label="Eliminar nota"
                              >
                                ×
                              </button>
                            </div>
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
          {!batchRunning && batchTotal > 0 && showBatchMsg && (
            <p className="db-ok db-ok--fade">
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

          {importReminder && unclassifiedCount > 0 && (
            <div className="classify-reminder">
              <span>
                Tienes <strong>{unclassifiedCount}</strong>{" "}
                {unclassifiedCount === 1 ? "CV sin clasificar" : "CVs sin clasificar"}.
              </span>
              <button
                className="btn-sm classify-btn"
                onClick={onAutoClassify}
                disabled={classifying}
              >
                {classifying ? "Clasificando…" : "✨ Clasificar automáticamente"}
              </button>
            </div>
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

      {screen === "vacantes" && <Vacancies />}
      {screen === "pipeline" && <Pipeline />}
      {screen === "panel" && <Panel />}
      {screen === "ajustes" && (
        <Settings
          onWiped={() => {
            refreshCandidates();
            refreshFilters();
          }}
        />
      )}
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
