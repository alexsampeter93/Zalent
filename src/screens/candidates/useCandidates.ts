import { useEffect, useState } from "react";
import {
  listCandidates,
  listForClassification,
  cleanupOrphans,
  getCandidate,
  updateCandidate,
  deleteCandidate,
  anonymizeCandidate,
  type CandidateRow,
  type CandidateDetail,
} from "../../lib/candidates";
import { suggestTags } from "../../lib/ai/classify";
import { setVote, listVotes, type Vote } from "../../lib/feedback";
import {
  addNote,
  listNotes,
  deleteNote,
  listCandidatesWithNotes,
  type Note,
} from "../../lib/notes";
import { indexAllCandidates, search, type SearchHit } from "../../lib/ai/search";
import { reportError } from "../../lib/errors";
import { exportCandidatesCsv } from "../../lib/exportCandidates";
import {
  listVacancies,
  listAllMemberships,
  listCandidateVacancies,
  setCandidateStage,
  addCandidateToVacancy,
} from "../../lib/vacancies";
import {
  addTag,
  removeTag,
  listCandidateTags,
  listAllTags,
  listAllTagAssignments,
} from "../../lib/tags";
import { type CandidateForm, emptyForm, splitList } from "../../lib/candidate-form";
import { RELEVANT_FLOOR } from "../../lib/display";

// Una fila de la tabla/lista: da igual si viene de "todos los candidatos" o de
// un resultado de búsqueda (que además trae `match`, el % de encaje).
export interface Row {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  source_file: string | null;
  match?: number;
}

// TODO el estado y la lógica de la pantalla Candidatos, en un hook. Es también
// la FUENTE DE DATOS central de la app: la lista de candidatos y los datos de
// filtro los comparten Importar (refresca al importar) y Ajustes (al borrar
// todo), así que App llama a este hook una vez y les pasa lo que necesitan.
export function useCandidates({
  active,
  ready,
}: {
  active: boolean;
  // ¿ya se puede tocar la base de datos? Falso mientras la app está
  // comprobando el bloqueo o bloqueada. Sin esto, estos efectos consultarían
  // SQLite ANTES de que el usuario introduzca la contraseña maestra — hoy no
  // pasa nada porque la BD no está cifrada, pero en cuanto lo esté, esas
  // consultas fallarían porque la clave de cifrado todavía no se conoce.
  ready: boolean;
}) {
  const [showCandReminder, setShowCandReminder] = useState(false);

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

  // Carga inicial: espera a `ready` (no a que el componente se monte) para
  // no tocar la BD mientras la app sigue bloqueada. Solo se dispara una vez,
  // el momento en que `ready` pasa de false a true tras desbloquear.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      await cleanupOrphans(); // limpia huérfanos de borrados antiguos
      await refreshCandidates();
      await refreshFilters();
    })();
  }, [ready]);

  // Al volver a Candidatos, recargar por si cambió algo en otra pantalla
  // (p.ej. asignar a ofertas o mover fases en el Pipeline).
  useEffect(() => {
    if (active && ready) {
      refreshCandidates();
      refreshFilters();
    }
  }, [active, ready]);

  // Recordatorio flotante en Candidatos: aparece al entrar y se va solo.
  useEffect(() => {
    if (!active) {
      setShowCandReminder(false);
      return;
    }
    setShowCandReminder(true);
    const t = setTimeout(() => setShowCandReminder(false), 6500);
    return () => clearTimeout(t);
  }, [active]);

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
      // El aviso "sin clasificar" (en Importar) desaparece solo: se muestra con
      // `importReminder && unclassifiedCount > 0`, y esto deja el contador en 0.
      setClassifyMsg(`Clasificados ${tagged} de ${all.length} CVs`);
    } catch (e) {
      reportError("No se pudo completar la clasificación automática", e);
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
      reportError("No se pudieron cargar los filtros (ofertas y etiquetas)", e);
    }
  }

  async function refreshCandidates() {
    try {
      setCandidates(await listCandidates());
    } catch (e) {
      // Sin esto, un fallo al leer dejaba la lista vacía y parecía que no
      // había candidatos guardados.
      reportError("No se pudo cargar la lista de candidatos", e);
    }
  }

  // Refrescar TODO (lista + filtros). Lo usan Importar (tras importar) y
  // Ajustes (tras borrar/anonimizar toda la base).
  async function refreshAll() {
    await refreshCandidates();
    await refreshFilters();
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
      reportError("No se pudo abrir la ficha del candidato", e);
    }
  }

  // Añadir/quitar etiquetas del candidato abierto.
  async function onAddTag(raw: string) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t || selectedId == null || tags.includes(t)) {
      setTagInput("");
      return;
    }
    // Actualización OPTIMISTA: la etiqueta aparece antes de estar guardada,
    // para que la interfaz responda al instante. El precio es que, si la
    // escritura falla, hay que DESHACERLO — si no, la pantalla enseñaría una
    // etiqueta que no existe en la base, y el usuario se enteraría al reiniciar.
    setTags((cur) => [...cur, t]);
    setTagInput("");
    try {
      await addTag(selectedId, t);
      await refreshFilters();
    } catch (e) {
      setTags((cur) => cur.filter((x) => x !== t));
      reportError(`No se pudo añadir la etiqueta "${t}"`, e);
    }
  }
  async function onRemoveTag(t: string) {
    if (selectedId == null) return;
    setTags((cur) => cur.filter((x) => x !== t));
    try {
      await removeTag(selectedId, t);
      await refreshFilters();
    } catch (e) {
      // Vuelve a su sitio (al final: el orden exacto lo restaura el próximo
      // `selectCandidate`, que las lee ya ordenadas de la base).
      setTags((cur) => (cur.includes(t) ? cur : [...cur, t]));
      reportError(`No se pudo quitar la etiqueta "${t}"`, e);
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
      // Importante que se vea: el formulario sigue con los datos escritos y sin
      // aviso el usuario creería que ya están guardados.
      reportError("No se pudieron guardar los cambios del candidato", e);
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
      reportError("No se pudo borrar el candidato", e);
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
      // Es una acción RGPD: creer que se anonimizó cuando no ha pasado es
      // exactamente el fallo que no te puedes permitir aquí.
      reportError("No se pudo anonimizar el candidato", e);
    } finally {
      setAnonymizing(false);
    }
  }

  // Cambia la fase del candidato DENTRO de una oferta (desde su ficha).
  async function onOfferStageChange(vacancyId: number, stage: string) {
    if (selectedId == null) return;
    // La fase anterior, para poder volver si el guardado falla.
    const previous = candOffers.find((o) => o.id === vacancyId)?.stage;
    setCandOffers((cur) =>
      cur.map((o) => (o.id === vacancyId ? { ...o, stage } : o)),
    );
    try {
      await setCandidateStage(selectedId, vacancyId, stage);
    } catch (e) {
      if (previous !== undefined) {
        setCandOffers((cur) =>
          cur.map((o) => (o.id === vacancyId ? { ...o, stage: previous } : o)),
        );
      }
      reportError("No se pudo cambiar la fase del candidato en la oferta", e);
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
      // El texto se queda en el cuadro (no se limpia si falla), así que el
      // usuario puede reintentar sin volver a escribirlo.
      reportError("No se pudo guardar la nota", e);
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
      reportError("No se pudo borrar la nota", e);
    }
  }

  // Voto 👍/👎 del candidato abierto (pulsar el mismo voto lo quita).
  async function onVote(vote: Vote) {
    if (selectedId == null) return;
    const id = selectedId;
    const previous = votes.get(id);
    const next: Vote | null = previous === vote ? null : vote;
    setVotes((m) => {
      const n = new Map(m);
      if (next === null) n.delete(id);
      else n.set(id, next);
      return n;
    });
    try {
      await setVote(id, next);
    } catch (e) {
      setVotes((m) => {
        const n = new Map(m);
        if (previous === undefined) n.delete(id);
        else n.set(id, previous);
        return n;
      });
      reportError("No se pudo guardar tu voto", e);
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
      // El bucle se corta al primer fallo: unos se habrán borrado y otros no.
      // La lista se refresca igualmente (en el `finally` del llamador no, pero
      // sí al salir), así que el usuario ve el estado real y puede reintentar.
      await refreshCandidates();
      reportError("No se pudieron borrar todos los candidatos seleccionados", e);
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
      await refreshFilters();
      reportError("No se pudieron añadir todos los candidatos a la oferta", e);
    }
  }

  // ---- Datos derivados (para pintar la tabla/lista) ----
  // Filas: resultados de búsqueda o todos los candidatos.
  const searchMode = hasSearched && query.trim() !== "";
  // El resultado de búsqueda es una FOTO del momento en que se buscó: si luego
  // editas a un candidato, esa foto no cambia. Por eso los datos de display
  // (nombre, puesto…) NO se leen del resultado, sino de `candidates`, que sí se
  // refresca al editar (refreshCandidates). Del resultado se usa solo el score,
  // que es lo único que la lista de candidatos no sabe calcular. Así el orden
  // por relevancia se mantiene y los datos son siempre los actuales.
  // (Antes esto causaba que un puesto editado durante una búsqueda siguiera
  // mostrando el valor viejo hasta reiniciar la app.)
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const rows: Row[] = searchMode
    ? results.map((r) => {
        const c = candById.get(r.id);
        return {
          id: r.id,
          full_name: c?.full_name ?? r.full_name,
          email: c?.email ?? r.email,
          headline: c?.headline ?? r.headline,
          source_file: c?.source_file ?? r.source_file,
          match: r.score,
        };
      })
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

  // ---- Exportar ----
  // Exporta lo que el usuario está VIENDO (o lo que ha seleccionado), no la
  // base entera: si has filtrado por una oferta, esperas el fichero de esa
  // oferta, no de todo. La selección múltiple manda sobre los filtros: si has
  // marcado candidatos a mano, es que quieres exactamente esos.
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  async function onExport() {
    setExporting(true);
    setExportMsg("");
    try {
      const ids =
        selectedIds.size > 0 ? [...selectedIds] : visibleRows.map((r) => r.id);
      const { path, count } = await exportCandidatesCsv(ids);
      setExportMsg(`✅ ${count} candidato(s) exportados a ${path}`);
    } catch (e) {
      reportError("No se pudo exportar el CSV", e);
    } finally {
      setExporting(false);
    }
  }

  const hitById = new Map(results.map((r) => [r.id, r]));
  const selectedHit = selectedId != null ? hitById.get(selectedId) : undefined;
  const relevantCount = searchMode
    ? results.filter((r) => r.score >= RELEVANT_FLOOR).length
    : 0;
  // Candidatos sin ninguna etiqueta (para el aviso "sin clasificar").
  const unclassifiedCount = candidates.filter(
    (c) => !tagByCandidate.get(c.id)?.size,
  ).length;

  return {
    // filtros
    filterVacancy, setFilterVacancy, filterMissing, setFilterMissing,
    filterTag, setFilterTag, filterNotes, setFilterNotes, sortBy, setSortBy,
    vacancyList, membership, allTags,
    // selección múltiple
    selectionMode, setSelectionMode, selectedIds, bulkDeleting,
    confirmBulkDelete, setConfirmBulkDelete,
    toggleSelect, toggleSelectAll, exitSelection, onBulkDelete, onBulkAddToVacancy,
    // ficha del seleccionado
    tags, tagInput, setTagInput, candOffers, votes,
    // clasificación
    classifying, classifyMsg, onAutoClassify,
    // búsqueda
    query, setQuery, searching, searchStatus, doSearch, clearSearch,
    // detalle / edición / notas
    selectedId, detail, editing, setEditing, editForm, savingEdit,
    confirmingDelete, setConfirmingDelete, deleting,
    confirmingAnon, setConfirmingAnon, anonymizing,
    notes, newNote, setNewNote, savingNote,
    selectCandidate, onAddTag, onRemoveTag, backToList, startEdit, setEditField,
    onUpdate, onDelete, onAnonymize, onOfferStageChange, onAddNote, onDeleteNote, onVote,
    // exportar
    exporting, exportMsg, onExport,
    // avisos y derivados
    showCandReminder, searchMode, rows, filtersActive, visibleRows,
    selectedHit, relevantCount, unclassifiedCount,
    // compartido con Importar/Ajustes
    refreshAll,
  };
}

export type CandidatesState = ReturnType<typeof useCandidates>;
