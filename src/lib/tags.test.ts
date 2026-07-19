import { describe, expect, it, vi, beforeEach } from "vitest";
import { addTag, removeTag, listCandidateTags, listAllTags } from "./tags";

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

// La normalización de etiquetas es privada (`cleanTag`), así que se comprueba
// por lo que de verdad importa: el valor que acaba en la base de datos.
describe("addTag: normalización", () => {
  it("recorta los espacios de los extremos", async () => {
    await addTag(1, "   carretillero   ");
    expect(executed[0].args[1]).toBe("carretillero");
  });

  it("colapsa los espacios interiores", async () => {
    // Sin esto, "mozo  almacén" y "mozo almacén" serían etiquetas DISTINTAS y
    // el filtro las separaría sin que el usuario entienda por qué.
    await addTag(1, "mozo   de    almacén");
    expect(executed[0].args[1]).toBe("mozo de almacén");
  });

  it("respeta las mayúsculas tal como las escribe el recruiter", async () => {
    // Decisión deliberada: "PRL" no debe convertirse en "prl".
    await addTag(1, "PRL");
    expect(executed[0].args[1]).toBe("PRL");
  });

  it("ignora una etiqueta vacía o de solo espacios", async () => {
    await addTag(1, "   ");
    await addTag(1, "");
    expect(executed).toHaveLength(0);
  });
});

describe("addTag / removeTag", () => {
  it("poner dos veces la misma etiqueta no duplica ni falla", async () => {
    await addTag(1, "soldadura");
    expect(executed[0].sql).toContain("ON CONFLICT(candidate_id, tag) DO NOTHING");
  });

  it("quitar una etiqueta solo afecta a ese candidato", async () => {
    await removeTag(4, "soldadura");
    expect(executed[0].sql).toContain("candidate_id = $1 AND tag = $2");
    expect(executed[0].args).toEqual([4, "soldadura"]);
  });
});

describe("lecturas", () => {
  it("las etiquetas de un candidato salen ordenadas y sin distinguir mayúsculas", async () => {
    selectResult.rows = [{ tag: "PRL" }, { tag: "soldadura" }];
    await expect(listCandidateTags(1)).resolves.toEqual(["PRL", "soldadura"]);
    expect(selected[0].sql).toContain("ORDER BY tag COLLATE NOCASE");
  });

  it("la lista global no repite etiquetas", async () => {
    selectResult.rows = [{ tag: "almacén" }];
    await listAllTags();
    expect(selected[0].sql).toContain("SELECT DISTINCT tag");
  });
});
