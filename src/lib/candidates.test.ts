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
// Simulamos la base de datos guardando cada sentencia ejecutada en una lista,
// y el borrado de ficheros (que habla con Rust) como un espía.
const executed: { sql: string; args: unknown[] }[] = [];
const selectResult = { rows: [] as unknown[] };
const lastInsertId = { value: 1 };

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: vi.fn(async (sql: string, args: unknown[] = []) => {
      executed.push({ sql, args });
      return { lastInsertId: lastInsertId.value, rowsAffected: 1 };
    }),
    select: vi.fn(async () => selectResult.rows),
  }),
}));

vi.mock("./files", () => ({ deleteCvFile: vi.fn(async () => {}) }));

import { deleteCvFile } from "./files";

// ¿Se ejecutó alguna sentencia que contenga todos estos fragmentos?
function ran(...fragments: string[]): boolean {
  return executed.some((e) => fragments.every((f) => e.sql.includes(f)));
}

// Posición de la primera sentencia que contiene el fragmento (para el orden).
function indexOf(fragment: string): number {
  return executed.findIndex((e) => e.sql.includes(fragment));
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
  executed.length = 0;
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
    const skills = executed.filter((e) => e.sql.includes("INSERT INTO skills"));
    const langs = executed.filter((e) => e.sql.includes("INSERT INTO languages"));
    expect(skills).toHaveLength(2);
    expect(langs).toHaveLength(2);
    expect(skills[0].args).toEqual([1, "Figma"]);
  });

  it("guarda null (no cadena vacía) en los campos que el usuario dejó en blanco", async () => {
    await saveCandidate(input);
    const insert = executed[0].args;
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
    const del = executed.find((e) => e.sql.includes("candidate_chunks"));
    expect(del?.args).toEqual([7]);
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
    expect(executed[0].sql).toContain("UPDATE candidates");
    expect(executed[0].args).toContain("Product Designer");
    expect(executed[0].args[8]).toBe(7); // el id, al final
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
    "candidate_vectors",
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
    // El texto y los vectores contienen el nombre: tienen que irse.
    expect(ran("DELETE FROM candidate_chunks")).toBe(true);
    expect(ran("DELETE FROM candidate_vectors")).toBe(true);
    // La ficha sigue existiendo (se actualiza, no se borra).
    expect(ran("UPDATE candidates", "raw_text = NULL")).toBe(true);
    expect(ran("DELETE FROM candidates WHERE")).toBe(false);
  });
});
