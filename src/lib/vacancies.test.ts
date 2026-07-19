import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createVacancy,
  updateVacancy,
  deleteVacancy,
  addCandidateToVacancy,
  removeCandidateFromVacancy,
  setCandidateStage,
  listVacancyCandidates,
} from "./vacancies";

// Como en candidates.test.ts: se simula la base de datos capturando el SQL, y
// `invoke` para las escrituras atómicas. Lo que se comprueba no es "devuelve
// X" —estas funciones casi no devuelven nada— sino QUÉ SQL sale.
const executed: { sql: string; args: unknown[] }[] = [];
const batches: { sql: string; params: unknown[] }[][] = [];
const selected: { sql: string; args: unknown[] }[] = [];
const selectResult = { rows: [] as unknown[] };
const lastInsertId = { value: 1 };

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      executed.push({ sql, args });
      return { lastInsertId: lastInsertId.value, rowsAffected: 1 };
    }),
    select: vi.fn(async (sql: string, args: unknown[] = []) => {
      selected.push({ sql, args });
      return selectResult.rows;
    }),
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "db_transaction") {
      const stmts = args.statements as { sql: string; params: unknown[] }[];
      batches.push(stmts);
      return stmts.map(() => 0);
    }
    return null;
  }),
}));

beforeEach(() => {
  executed.length = 0;
  batches.length = 0;
  selected.length = 0;
  selectResult.rows = [];
  lastInsertId.value = 1;
  vi.clearAllMocks();
});

describe("createVacancy", () => {
  it("devuelve el id de la oferta creada", async () => {
    lastInsertId.value = 7;
    await expect(createVacancy("Mozo de almacén")).resolves.toBe(7);
  });

  it("recorta espacios del título pero NO de la descripción", async () => {
    // El título es una etiqueta corta (los espacios sobran); la descripción es
    // texto pegado de una oferta, donde el formato puede importar.
    await createVacancy("  Soldador TIG  ", "  Se busca...\n\n  Turnos.  ");
    expect(executed[0].args[0]).toBe("Soldador TIG");
    expect(executed[0].args[1]).toBe("  Se busca...\n\n  Turnos.  ");
  });
});

describe("updateVacancy", () => {
  it("solo toca los campos que le pasas", async () => {
    await updateVacancy(3, { status: "cerrada" });
    const sql = executed[0].sql;
    expect(sql).toContain("status = $1");
    expect(sql).not.toContain("title");
    expect(sql).not.toContain("description");
  });

  it("numera los parámetros en orden y deja el id el último", async () => {
    // El SQL se construye a mano con un contador ($1, $2…). Si la numeración
    // se descuadrara, los valores acabarían en la columna equivocada — un fallo
    // que no da error, solo datos cruzados.
    await updateVacancy(9, {
      title: "Carretillero",
      description: "turno de tarde",
      status: "abierta",
    });
    const { sql, args } = executed[0];
    expect(sql).toContain("title = $1");
    expect(sql).toContain("description = $2");
    expect(sql).toContain("status = $3");
    expect(sql).toContain("WHERE id = $4");
    expect(args).toEqual(["Carretillero", "turno de tarde", "abierta", 9]);
  });

  it("actualiza siempre la marca de tiempo", async () => {
    await updateVacancy(1, { title: "X" });
    expect(executed[0].sql).toContain("updated_at = datetime('now')");
  });

  it("no lanza ninguna consulta si no hay nada que cambiar", async () => {
    await updateVacancy(1, {});
    expect(executed).toHaveLength(0);
  });
});

describe("deleteVacancy", () => {
  it("borra la oferta y sus asignaciones en UNA transacción", async () => {
    await deleteVacancy(4);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
  });

  it("NUNCA borra candidatos ni sus CVs (el almacén es la fuente de verdad)", async () => {
    // La regla de la Fase 5: una oferta es una vista sobre el almacén, no su
    // dueña. Si esto se rompiera, cerrar una oferta destruiría currículums.
    await deleteVacancy(4);
    const sql = batches[0].map((s) => s.sql).join(" | ");
    expect(sql).not.toContain("FROM candidates");
    expect(sql).toContain("DELETE FROM candidate_vacancy WHERE vacancy_id");
    expect(sql).toContain("DELETE FROM vacancies WHERE id");
  });
});

describe("asignaciones candidato ↔ oferta", () => {
  it("añadir dos veces al mismo candidato no duplica ni falla", async () => {
    await addCandidateToVacancy(5, 2);
    expect(executed[0].sql).toContain("ON CONFLICT(candidate_id, vacancy_id) DO NOTHING");
    expect(executed[0].args).toEqual([5, 2]);
  });

  it("quitar a un candidato solo afecta a ESA oferta", async () => {
    await removeCandidateFromVacancy(5, 2);
    expect(executed[0].sql).toContain("candidate_id = $1 AND vacancy_id = $2");
    expect(executed[0].args).toEqual([5, 2]);
  });

  it("la fase se guarda por oferta, no en el candidato", async () => {
    // Un candidato puede ir por "entrevista" en una oferta y "descartado" en
    // otra: la fase vive en la tabla de unión.
    await setCandidateStage(5, 2, "entrevista");
    expect(executed[0].sql).toContain("UPDATE candidate_vacancy");
    expect(executed[0].sql).not.toContain("UPDATE candidates");
    expect(executed[0].args).toEqual(["entrevista", 5, 2]);
  });
});

describe("listVacancyCandidates", () => {
  it("ordena por nombre ignorando mayúsculas y filtra por la oferta", async () => {
    await listVacancyCandidates(2);
    expect(selected[0].sql).toContain("ORDER BY c.full_name COLLATE NOCASE");
    expect(selected[0].args).toEqual([2]);
  });
});
