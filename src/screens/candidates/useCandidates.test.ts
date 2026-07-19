// @vitest-environment jsdom
//
// useCandidates es un HOOK de React (no una función pura): guarda estado y
// llama a media docena de módulos que hablan con SQLite. Para probarlo hace
// falta un DOM simulado (jsdom) y una forma de "montar" el hook fuera de un
// componente real — para eso está `renderHook` de React Testing Library.
//
// Cada módulo de lib/ que toca la base de datos se sustituye por un doble de
// prueba (vi.mock): en vez de ir a SQLite, cada función mockeada devuelve
// justo lo que el test necesita para esa comprobación.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCandidates } from "./useCandidates";
import type { CandidateRow, CandidateDetail } from "../../lib/candidates";

vi.mock("../../lib/candidates", () => ({
  listCandidates: vi.fn(),
  listForClassification: vi.fn(),
  cleanupOrphans: vi.fn(),
  getCandidate: vi.fn(),
  updateCandidate: vi.fn(),
  deleteCandidate: vi.fn(),
  anonymizeCandidate: vi.fn(),
}));
vi.mock("../../lib/ai/classify", () => ({ suggestTags: vi.fn() }));
vi.mock("../../lib/feedback", () => ({ setVote: vi.fn(), listVotes: vi.fn() }));
vi.mock("../../lib/notes", () => ({
  addNote: vi.fn(),
  listNotes: vi.fn(),
  deleteNote: vi.fn(),
  listCandidatesWithNotes: vi.fn(),
}));
vi.mock("../../lib/ai/search", () => ({ indexAllCandidates: vi.fn(), search: vi.fn() }));
vi.mock("../../lib/vacancies", () => ({
  listVacancies: vi.fn(),
  listAllMemberships: vi.fn(),
  listCandidateVacancies: vi.fn(),
  setCandidateStage: vi.fn(),
  addCandidateToVacancy: vi.fn(),
}));
vi.mock("../../lib/tags", () => ({
  addTag: vi.fn(),
  removeTag: vi.fn(),
  listCandidateTags: vi.fn(),
  listAllTags: vi.fn(),
  listAllTagAssignments: vi.fn(),
}));

import {
  listCandidates, listForClassification, cleanupOrphans, getCandidate,
  updateCandidate, deleteCandidate, anonymizeCandidate,
} from "../../lib/candidates";
import { suggestTags } from "../../lib/ai/classify";
import { setVote, listVotes } from "../../lib/feedback";
import { addNote, listNotes, deleteNote, listCandidatesWithNotes } from "../../lib/notes";
import { indexAllCandidates, search } from "../../lib/ai/search";
import {
  listVacancies, listAllMemberships, listCandidateVacancies,
  setCandidateStage, addCandidateToVacancy,
} from "../../lib/vacancies";
import { addTag, removeTag, listCandidateTags, listAllTags, listAllTagAssignments } from "../../lib/tags";

const CAND_1: CandidateRow = {
  id: 1, full_name: "Ana García", email: "ana@x.com", headline: "Backend",
  source_file: "ana.pdf", status: "new", created_at: "2024-01-01 00:00:00",
};
const CAND_2: CandidateRow = {
  id: 2, full_name: "Bruno Ruiz", email: null, headline: "Frontend",
  source_file: "bruno.pdf", status: "new", created_at: "2024-01-02 00:00:00",
};

function detailOf(row: CandidateRow): CandidateDetail {
  return {
    id: row.id, full_name: row.full_name, email: row.email, phone: null,
    location: null, headline: row.headline, years_experience: null,
    education: null, links: null, source_file: row.source_file,
    file_path: null, raw_text: null, status: row.status,
    created_at: row.created_at, skills: [], languages: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks(); // si no, las llamadas de un test "contaminan" el conteo del siguiente
  vi.mocked(listCandidates).mockResolvedValue([CAND_1, CAND_2]);
  vi.mocked(listForClassification).mockResolvedValue([]);
  vi.mocked(cleanupOrphans).mockResolvedValue(undefined);
  vi.mocked(getCandidate).mockImplementation(async (id: number) =>
    detailOf(id === 1 ? CAND_1 : CAND_2),
  );
  vi.mocked(updateCandidate).mockResolvedValue(undefined);
  vi.mocked(deleteCandidate).mockResolvedValue(undefined);
  vi.mocked(anonymizeCandidate).mockResolvedValue(undefined);
  vi.mocked(suggestTags).mockReturnValue([]);
  vi.mocked(setVote).mockResolvedValue(undefined);
  vi.mocked(listVotes).mockResolvedValue([]);
  vi.mocked(addNote).mockResolvedValue(undefined);
  vi.mocked(listNotes).mockResolvedValue([]);
  vi.mocked(deleteNote).mockResolvedValue(undefined);
  vi.mocked(listCandidatesWithNotes).mockResolvedValue([]);
  vi.mocked(indexAllCandidates).mockResolvedValue(0);
  vi.mocked(search).mockResolvedValue([]);
  vi.mocked(listVacancies).mockResolvedValue([]);
  vi.mocked(listAllMemberships).mockResolvedValue([]);
  vi.mocked(listCandidateVacancies).mockResolvedValue([]);
  vi.mocked(setCandidateStage).mockResolvedValue(undefined);
  vi.mocked(addCandidateToVacancy).mockResolvedValue(undefined);
  vi.mocked(addTag).mockResolvedValue(undefined);
  vi.mocked(removeTag).mockResolvedValue(undefined);
  vi.mocked(listCandidateTags).mockResolvedValue([]);
  vi.mocked(listAllTags).mockResolvedValue([]);
  vi.mocked(listAllTagAssignments).mockResolvedValue([]);
});

describe("useCandidates: carga inicial", () => {
  it("carga la lista de candidatos al montar", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("con ready=false NO toca la base de datos todavía (app bloqueada)", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: false }));
    // Un respiro para que, SI el hook fuera a consultar, ya lo hubiera hecho.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(listCandidates).not.toHaveBeenCalled();
    expect(cleanupOrphans).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
  });

  it("al pasar ready de false a true (desbloquear), carga la BD en ese momento", async () => {
    const { result, rerender } = renderHook(
      ({ ready }) => useCandidates({ active: true, ready }),
      { initialProps: { ready: false } },
    );
    expect(listCandidates).not.toHaveBeenCalled();

    rerender({ ready: true }); // equivale a desbloquear con éxito

    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(cleanupOrphans).toHaveBeenCalled();
  });
});

describe("useCandidates: selección y ficha", () => {
  it("selectCandidate carga detalle, notas, etiquetas y ofertas del candidato", async () => {
    vi.mocked(listNotes).mockResolvedValue([
      { id: 1, body: "buena impresión", created_at: "2024-01-01 10:00:00" },
    ]);
    vi.mocked(listCandidateTags).mockResolvedValue(["Inglés"]);
    vi.mocked(listCandidateVacancies).mockResolvedValue([{ id: 5, title: "Backend Sr.", stage: "screening" }]);

    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    await act(async () => {
      await result.current.selectCandidate(1);
    });

    expect(getCandidate).toHaveBeenCalledWith(1);
    expect(result.current.detail?.full_name).toBe("Ana García");
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.tags).toEqual(["Inglés"]);
    expect(result.current.candOffers).toEqual([{ id: 5, title: "Backend Sr.", stage: "screening" }]);
  });
});

describe("useCandidates: etiquetas", () => {
  it("onAddTag añade la etiqueta al estado y la persiste", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await act(async () => { await result.current.selectCandidate(1); });

    await act(async () => { await result.current.onAddTag("Carné C+E"); });

    expect(result.current.tags).toContain("Carné C+E");
    expect(addTag).toHaveBeenCalledWith(1, "Carné C+E");
  });

  it("onAddTag no añade una etiqueta duplicada", async () => {
    vi.mocked(listCandidateTags).mockResolvedValue(["Inglés"]);
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await act(async () => { await result.current.selectCandidate(1); });

    await act(async () => { await result.current.onAddTag("Inglés"); });

    expect(result.current.tags).toEqual(["Inglés"]); // no se duplica
    expect(addTag).not.toHaveBeenCalled();
  });

  it("onRemoveTag quita la etiqueta del estado y la persiste", async () => {
    vi.mocked(listCandidateTags).mockResolvedValue(["Inglés", "Francés"]);
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await act(async () => { await result.current.selectCandidate(1); });

    await act(async () => { await result.current.onRemoveTag("Inglés"); });

    expect(result.current.tags).toEqual(["Francés"]);
    expect(removeTag).toHaveBeenCalledWith(1, "Inglés");
  });
});

describe("useCandidates: borrado y voto", () => {
  it("onDelete borra el candidato y vuelve a la lista", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await act(async () => { await result.current.selectCandidate(1); });
    expect(result.current.selectedId).toBe(1);

    await act(async () => { await result.current.onDelete(); });

    expect(deleteCandidate).toHaveBeenCalledWith(1);
    expect(result.current.selectedId).toBeNull();
    expect(result.current.detail).toBeNull();
  });

  it("onVote: pulsar el mismo voto otra vez lo quita", async () => {
    vi.mocked(listVotes).mockResolvedValue([{ candidate_id: 1, vote: 1 }]);
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    await act(async () => { await result.current.selectCandidate(1); });
    expect(result.current.votes.get(1)).toBe(1);

    await act(async () => { await result.current.onVote(1); });

    expect(result.current.votes.get(1)).toBeUndefined();
    expect(setVote).toHaveBeenCalledWith(1, null);
  });
});

describe("useCandidates: búsqueda", () => {
  it("doSearch indexa, busca y activa el modo búsqueda", async () => {
    vi.mocked(search).mockResolvedValue([
      { id: 2, full_name: "Bruno Ruiz", email: null, headline: "Frontend", source_file: "bruno.pdf", score: 0.8, evidence: "", matched: [], why: "" },
    ]);
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => { result.current.setQuery("frontend react"); });
    await act(async () => { await result.current.doSearch(); });

    expect(indexAllCandidates).toHaveBeenCalled();
    expect(search).toHaveBeenCalledWith("frontend react");
    expect(result.current.searchMode).toBe(true);
    expect(result.current.rows).toEqual([
      expect.objectContaining({ id: 2, match: 0.8 }),
    ]);
  });

  it("en modo búsqueda, editar un candidato actualiza su fila (no muestra el dato viejo)", async () => {
    // Regresión de un bug real: se editaba el puesto de un candidato con una
    // búsqueda activa, se guardaba bien en la ficha, pero la lista seguía
    // mostrando el puesto VIEJO hasta reiniciar la app. El resultado de
    // búsqueda es una foto fija; los datos de display deben salir de
    // `candidates` (que sí se refresca al editar), no de esa foto.
    // Estado de partida COHERENTE: tanto la lista como el resultado de
    // búsqueda ven a Bruno como "Auxiliar" (es su puesto antes de editar).
    vi.mocked(listCandidates).mockResolvedValue([CAND_1, { ...CAND_2, headline: "Auxiliar" }]);
    vi.mocked(search).mockResolvedValue([
      { id: 2, full_name: "Bruno Ruiz", email: null, headline: "Auxiliar", source_file: "bruno.pdf", score: 0.8, evidence: "", matched: [], why: "" },
    ]);
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => { result.current.setQuery("auxiliar"); });
    await act(async () => { await result.current.doSearch(); });
    expect(result.current.rows[0]).toEqual(expect.objectContaining({ id: 2, headline: "Auxiliar" }));

    // Editamos: refreshCandidates traerá a Bruno ya como "Profesor".
    vi.mocked(listCandidates).mockResolvedValue([
      CAND_1,
      { ...CAND_2, headline: "Profesor" },
    ]);
    act(() => { result.current.selectCandidate(2); });
    await act(async () => { await result.current.onUpdate(); });

    // Sigue en modo búsqueda (mismo orden por relevancia), pero el puesto ya es
    // el nuevo, sin necesidad de reiniciar ni de volver a buscar.
    expect(result.current.searchMode).toBe(true);
    expect(result.current.rows[0]).toEqual(expect.objectContaining({ id: 2, headline: "Profesor", match: 0.8 }));
  });

  it("clearSearch vacía la consulta y sale del modo búsqueda", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    act(() => { result.current.setQuery("algo"); });
    await act(async () => { await result.current.doSearch(); });

    act(() => { result.current.clearSearch(); });

    expect(result.current.query).toBe("");
    expect(result.current.searchMode).toBe(false);
  });
});

describe("useCandidates: filtros", () => {
  it("filterMissing='email' deja fuera a los candidatos que sí tienen email", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => { result.current.setFilterMissing("email"); });

    // CAND_1 tiene email, CAND_2 no -> solo debe quedar CAND_2
    expect(result.current.visibleRows.map((r) => r.id)).toEqual([2]);
  });
});

describe("useCandidates: selección múltiple", () => {
  it("onBulkDelete borra los seleccionados y sale del modo selección", async () => {
    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    act(() => {
      result.current.setSelectionMode(true);
      result.current.toggleSelect(1);
      result.current.toggleSelect(2);
    });
    expect(result.current.selectedIds.size).toBe(2);

    await act(async () => { await result.current.onBulkDelete(); });

    expect(deleteCandidate).toHaveBeenCalledWith(1);
    expect(deleteCandidate).toHaveBeenCalledWith(2);
    expect(result.current.selectionMode).toBe(false);
    expect(result.current.selectedIds.size).toBe(0);
  });
});

describe("useCandidates: clasificación automática", () => {
  it("onAutoClassify etiqueta según lo que sugiere suggestTags", async () => {
    vi.mocked(listForClassification).mockResolvedValue([
      { id: 1, raw_text: "python y docker", years_experience: 3 },
    ]);
    vi.mocked(suggestTags).mockReturnValue(["3-5 años exp"]);

    const { result } = renderHook(() => useCandidates({ active: true, ready: true }));
    await waitFor(() => expect(result.current.rows).toHaveLength(2));

    await act(async () => { await result.current.onAutoClassify(); });

    expect(addTag).toHaveBeenCalledWith(1, "3-5 años exp");
    expect(result.current.classifyMsg).toContain("Clasificados 1 de 1");
  });
});
