import { describe, expect, it, vi, beforeEach } from "vitest";
import { addNote, listNotes, deleteNote, listCandidatesWithNotes } from "./notes";

const executed: { sql: string; args: unknown[] }[] = [];
const selected: { sql: string; args: unknown[] }[] = [];
const selectResult = { rows: [] as unknown[] };

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      executed.push({ sql, args });
      return { lastInsertId: 1, rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, args: unknown[] = []) => {
      selected.push({ sql, args });
      return selectResult.rows;
    }),
  }),
}));

beforeEach(() => {
  executed.length = 0;
  selected.length = 0;
  selectResult.rows = [];
  vi.clearAllMocks();
});

describe("addNote", () => {
  it("no pone la fecha: la pone la base de datos", async () => {
    // Deliberado. Si la fecha viniera de la interfaz, dependería del reloj y de
    // la zona horaria del equipo; SQLite la guarda siempre en UTC.
    await addNote(3, "Llamada el lunes");
    expect(executed[0].sql).toContain("INSERT INTO notes (candidate_id, body)");
    expect(executed[0].sql).not.toContain("created_at");
    expect(executed[0].args).toEqual([3, "Llamada el lunes"]);
  });

  it("guarda el texto tal cual, sin recortar", async () => {
    // Al revés que las etiquetas: una nota es texto libre y sus saltos de
    // línea son parte de lo que el recruiter quiso escribir.
    await addNote(3, "  Punto 1\n  Punto 2  ");
    expect(executed[0].args[1]).toBe("  Punto 1\n  Punto 2  ");
  });
});

describe("listNotes", () => {
  it("devuelve la más reciente primero (timeline)", async () => {
    selectResult.rows = [
      { id: 9, body: "última", created_at: "2026-07-19 10:00:00" },
      { id: 4, body: "primera", created_at: "2026-07-01 10:00:00" },
    ];
    const notes = await listNotes(3);
    expect(notes[0].body).toBe("última");
    // Ordena por id, no por fecha: dos notas del mismo segundo tendrían la
    // misma fecha, y el id siempre es creciente.
    expect(selected[0].sql).toContain("ORDER BY id DESC");
  });

  it("solo trae las notas del candidato pedido", async () => {
    await listNotes(3);
    expect(selected[0].sql).toContain("WHERE candidate_id = $1");
    expect(selected[0].args).toEqual([3]);
  });
});

describe("deleteNote", () => {
  it("borra por el id de la NOTA, no por el del candidato", async () => {
    await deleteNote(12);
    expect(executed[0].sql).toBe("DELETE FROM notes WHERE id = $1");
    expect(executed[0].args).toEqual([12]);
  });
});

describe("listCandidatesWithNotes", () => {
  it("devuelve cada candidato una sola vez, aunque tenga varias notas", async () => {
    selectResult.rows = [{ candidate_id: 1 }, { candidate_id: 5 }];
    await expect(listCandidatesWithNotes()).resolves.toEqual([1, 5]);
    expect(selected[0].sql).toContain("SELECT DISTINCT candidate_id");
  });
});
