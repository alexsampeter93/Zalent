import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  saveCandidate,
  updateCandidate,
  deleteCandidate,
  anonymizeCandidate,
  type CandidateInput,
} from "./candidates";

// candidates.ts es la capa que ESCRIBE: guarda, edita, borra. Un fallo aquí no
// da un error visible, deja la base de datos en un estado incoherente (filas
// huérfanas, índice de búsqueda desfasado). Por eso los tests no comprueban
// "devuelve X", sino QUÉ SQL se ejecuta y en qué orden.
//
// Estas funciones ya no lanzan sentencias sueltas: mandan un BLOQUE atómico al
// comando `db_transaction` de Rust. Así que lo que se simula es `invoke`, y se
// guardan los bloques enteros — lo que permite comprobar no solo QUÉ SQL se
// ejecuta, sino que todo viaje en UNA sola transacción.
interface Stmt {
  sql: string;
  params: unknown[];
}
const batches: Stmt[][] = [];
const selectResult = { rows: [] as unknown[] };
const lastInsertId = { value: 1 };

// Todas las sentencias de todos los bloques, en orden (para las comprobaciones
// que solo miran el SQL).
function allStmts(): Stmt[] {
  return batches.flat();
}

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "db_transaction") {
      const stmts = args.statements as Stmt[];
      batches.push(stmts);
      // El id que devolvería cada sentencia; solo importa el de la primera.
      return stmts.map(() => lastInsertId.value);
    }
    return null;
  }),
}));

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: vi.fn(async () => ({ lastInsertId: 0, rowsAffected: 0 })),
    select: vi.fn(async () => selectResult.rows),
  }),
}));

vi.mock("./files", () => ({ deleteCvFile: vi.fn(async () => {}) }));

import { deleteCvFile } from "./files";

// ¿Se ejecutó alguna sentencia que contenga todos estos fragmentos?
function ran(...fragments: string[]): boolean {
  return allStmts().some((e) => fragments.every((f) => e.sql.includes(f)));
}

// Posición de la primera sentencia que contiene el fragmento (para el orden).
function indexOf(fragment: string): number {
  return allStmts().findIndex((e) => e.sql.includes(fragment));
}

const input: CandidateInput = {
  full_name: "Ana Pérez",
  email: "ana@example.com",
  phone: "",
  location: "Bilbao",
  headline: "Diseñadora UX",
  years_experience: 4,
  education: "Grado en Diseño",
  links: "",
  raw_text: "CV completo…",
  source_file: "ana.pdf",
  file_path: "/cvs/ana.pdf",
  skills: ["Figma", "Research"],
  languages: ["Español", "Inglés"],
};

beforeEach(() => {
  batches.length = 0;
  selectResult.rows = [];
  lastInsertId.value = 1;
  vi.clearAllMocks();
});

describe("saveCandidate", () => {
  it("devuelve el id que asignó la base de datos", async () => {
    lastInsertId.value = 42;
    await expect(saveCandidate(input)).resolves.toBe(42);
  });

  it("inserta una fila por cada skill y cada idioma", async () => {
    await saveCandidate(input);
    const stmts = allStmts();
    const skills = stmts.filter((e) => e.sql.includes("INSERT INTO skills"));
    const langs = stmts.filter((e) => e.sql.includes("INSERT INTO languages"));
    expect(skills).toHaveLength(2);
    expect(langs).toHaveLength(2);
    // `{__ref: 0}` = "el id que genere la sentencia 0". El id no puede ser un
    // número aquí: aún no existe cuando se construye el bloque.
    expect(skills[0].params).toEqual([{ __ref: 0 }, "Figma"]);
  });

  it("guarda la ficha y sus listas en UNA sola transacción", async () => {
    // Lo que impide que un fallo a mitad deje un candidato con la mitad de sus
    // skills. Si alguien vuelve a partirlo en escrituras sueltas, esto salta.
    await saveCandidate(input);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(5); // 1 candidato + 2 skills + 2 idiomas
  });

  it("guarda null (no cadena vacía) en los campos que el usuario dejó en blanco", async () => {
    await saveCandidate(input);
    const insert = allStmts()[0].params;
    expect(insert[2]).toBeNull(); // phone: venía como ""
    expect(insert[7]).toBeNull(); // links: venía como ""
    expect(insert[0]).toBe("Ana Pérez");
  });
});

describe("updateCandidate", () => {
  const patch = {
    full_name: "Ana Pérez",
    email: "ana@example.com",
    phone: "600000000",
    location: "Bilbao",
    headline: "Product Designer", // ← el puesto cambia
    years_experience: 5,
    education: "Grado en Diseño",
    links: "",
    skills: ["Figma"],
    languages: ["Español"],
  };

  it("invalida el índice de búsqueda del candidato editado", async () => {
    // Regresión: sin esto, la búsqueda semántica seguiría encontrando al
    // candidato por su puesto ANTIGUO, porque indexAllCandidates() solo indexa
    // a quien no tiene ningún fragmento. Ver Diario, entrada 44.
    await updateCandidate(7, patch);
    expect(ran("DELETE FROM candidate_chunks", "candidate_id")).toBe(true);
    const del = allStmts().find((e) => e.sql.includes("candidate_chunks"));
    expect(del?.params).toEqual([7]);
  });

  it("reemplaza skills e idiomas en vez de acumularlos", async () => {
    await updateCandidate(7, patch);
    expect(indexOf("DELETE FROM skills")).toBeLessThan(
      indexOf("INSERT INTO skills"),
    );
    expect(indexOf("DELETE FROM languages")).toBeLessThan(
      indexOf("INSERT INTO languages"),
    );
  });

  it("actualiza la ficha con los datos nuevos", async () => {
    await updateCandidate(7, patch);
    const first = allStmts()[0];
    expect(first.sql).toContain("UPDATE candidates");
    expect(first.params).toContain("Product Designer");
    expect(first.params[8]).toBe(7); // el id, al final
  });

  it("edita la ficha, sus listas y el índice en UNA sola transacción", async () => {
    await updateCandidate(7, patch);
    expect(batches).toHaveLength(1);
  });
});

describe("deleteCandidate (derecho al olvido)", () => {
  const related = [
    "notes",
    "skills",
    "languages",
    "candidate_tags",
    "candidate_vacancy",
    "candidate_chunks",
    "feedback",
  ];

  it("no deja filas huérfanas en ninguna tabla relacionada", async () => {
    await deleteCandidate(3);
    for (const table of related) {
      expect(ran(`DELETE FROM ${table}`, "candidate_id")).toBe(true);
    }
  });

  it("borra la ficha DESPUÉS que todo lo que depende de ella", async () => {
    await deleteCandidate(3);
    const ficha = indexOf("DELETE FROM candidates WHERE");
    for (const table of related) {
      expect(indexOf(`DELETE FROM ${table}`)).toBeLessThan(ficha);
    }
  });

  it("borra todas las tablas en UNA sola transacción", async () => {
    // Un borrado RGPD a medias dejaría datos personales de alguien que pidió
    // expresamente que se le borrara. Aquí la atomicidad no es una mejora
    // técnica: es el requisito.
    await deleteCandidate(3);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(related.length + 1); // + la propia ficha
  });

  it("borra también el archivo del CV del disco", async () => {
    selectResult.rows = [{ file_path: "/cvs/ana.pdf" }];
    await deleteCandidate(3);
    expect(deleteCvFile).toHaveBeenCalledWith("/cvs/ana.pdf");
  });

  it("no intenta borrar archivo si el candidato no tenía uno", async () => {
    selectResult.rows = [{ file_path: null }];
    await deleteCandidate(3);
    expect(deleteCvFile).not.toHaveBeenCalled();
  });
});

describe("anonymizeCandidate", () => {
  it("borra el rastro personal pero conserva la fila", async () => {
    selectResult.rows = [{ file_path: "/cvs/ana.pdf" }];
    await anonymizeCandidate(9);

    expect(deleteCvFile).toHaveBeenCalledWith("/cvs/ana.pdf");
    // El texto (los fragmentos) contiene el nombre: tiene que irse.
    expect(ran("DELETE FROM candidate_chunks")).toBe(true);
    // La ficha sigue existiendo (se actualiza, no se borra).
    expect(ran("UPDATE candidates", "raw_text = NULL")).toBe(true);
    expect(ran("DELETE FROM candidates WHERE")).toBe(false);
  });
});
