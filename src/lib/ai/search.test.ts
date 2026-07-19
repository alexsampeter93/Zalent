import { describe, expect, it, vi, beforeEach } from "vitest";
import { norm, chunkText, queryTerms, STOPWORDS, search } from "./search";

// search() habla con tres cosas que no existen en un test de Node: SQLite
// (getDb), el modelo de embeddings (embed) y la parte nativa (invoke). Las
// tres se simulan.
//
// Antes, para probar que un candidato puntuaba 0.525 había que FABRICAR dos
// vectores cuyo producto escalar diera ese número. Ahora el coseno se calcula
// en Rust y llega ya hecho, así que el test lo pone directamente: `cos: 0.525`.
// Se prueba lo que de verdad decide el resultado —la mezcla 60/40, la
// evidencia, el orden— sin aritmética de por medio. Ver Diario, entrada 45.
//
// Se simula `invoke` (el puente con Rust) y no `./vectors`, para que el
// contrato entre TypeScript y Rust —los nombres de los campos que cruzan—
// también quede cubierto.

// Un fragmento tal y como lo devuelve el comando `score_chunks` de Rust.
interface ScoredRow {
  candidate_id: number;
  text: string;
  cos: number;
}
// Las filas que devolvería SQLite, tipadas igual que las consulta el código
// bajo test (nada de `any`: si mañana cambia una consulta, el test se entera).
interface CandRow {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  education: string | null;
  source_file: string | null;
  raw_text: string | null;
}
const dbState = {
  scored: [] as ScoredRow[],
  candRows: [] as CandRow[],
  // Afinidad con tus votos 👍/👎 por candidato (la calcula Rust). Vacío = aún
  // no has votado nada, que es el caso normal en estos tests.
  boosts: {} as Record<string, number>,
};

vi.mock("../db", () => ({
  getDb: async () => ({
    select: vi.fn(async (sql: string) => {
      if (sql.includes("FROM candidates")) return dbState.candRows;
      return [];
    }),
    execute: vi.fn(async () => {}),
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "score_chunks") {
      return { chunks: dbState.scored, boosts: dbState.boosts };
    }
    if (cmd === "store_chunks") return 0;
    return null;
  }),
}));

vi.mock("./embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embeddings")>();
  return { ...actual, embed: vi.fn() };
});

import { embed } from "./embeddings";

beforeEach(() => {
  dbState.scored = [];
  dbState.candRows = [];
  dbState.boosts = {};
  // El vector de la consulta ya no influye en el resultado (el coseno lo
  // calcula Rust y el test lo fija), pero search() sí espera un vector.
  vi.mocked(embed).mockResolvedValue(Float32Array.from([1, 0]));
});

describe("norm", () => {
  it("quita acentos, mayúsculas y símbolos", () => {
    expect(norm("¡Gestión de Almacén, 100%!")).toBe("gestion de almacen 100");
  });
});

describe("chunkText", () => {
  it("no trocea un texto corto (cabe en un solo fragmento)", () => {
    expect(chunkText("hola mundo")).toEqual(["hola mundo"]);
  });

  it("devuelve vacío para texto vacío", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("trocea en fragmentos de 60 palabras con 12 de solape", () => {
    const words = Array.from({ length: 130 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(" "));
    // paso = 60 - 12 = 48; con 130 palabras: [0,60) [48,108) [96,130)
    expect(chunks).toHaveLength(3);
    expect(chunks[0].split(" ")).toHaveLength(60);
    expect(chunks[0].split(" ")[0]).toBe("w0");
    expect(chunks[1].split(" ")[0]).toBe("w48"); // el solape empieza aquí
    const lastWords = chunks[2].split(" ");
    expect(lastWords[lastWords.length - 1]).toBe("w129"); // cubre hasta el final
  });

  it("respeta el tope de 40 fragmentos en un texto larguísimo", () => {
    const words = Array.from({ length: 5000 }, (_, i) => `w${i}`);
    expect(chunkText(words.join(" ")).length).toBeLessThanOrEqual(40);
  });
});

describe("queryTerms", () => {
  it("quita palabras vacías y términos de menos de 3 letras", () => {
    expect(queryTerms("un almacén de logística")).toEqual(["almacen", "logistica"]);
  });

  it("deduplica términos repetidos", () => {
    expect(queryTerms("almacén almacén ALMACÉN")).toEqual(["almacen"]);
  });

  it("no incluye ninguna stopword de la lista", () => {
    const terms = queryTerms([...STOPWORDS].join(" ") + " almacen");
    expect(terms).toEqual(["almacen"]);
  });
});

describe("search", () => {
  it("puntúa más alto al candidato semánticamente más parecido", async () => {
    dbState.scored = [
      { candidate_id: 1, text: "desarrollador backend con Python", cos: 1 }, // máximo
      { candidate_id: 2, text: "cocinero de restaurante", cos: 0 }, // mínimo
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: "a@x.com", headline: "Backend", education: null, source_file: "a.pdf", raw_text: "desarrollador backend con Python" },
      { id: 2, full_name: "Bob", email: "b@x.com", headline: "Cocinero", education: null, source_file: "b.pdf", raw_text: "cocinero de restaurante" },
    ];

    const hits = await search("desarrollador backend");
    expect(hits[0].id).toBe(1);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it("calibra la semántica: por debajo de SEM_FLOOR el encaje semántico es 0", async () => {
    dbState.scored = [
      // 0.2 queda por debajo del suelo de ruido (SEM_FLOOR = 0.3)
      { candidate_id: 1, text: "atencion al cliente en tienda de ropa", cos: 0.2 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: "atencion al cliente en tienda de ropa" },
    ];

    // Vocabulario de la consulta deliberadamente SIN ninguna palabra en común
    // con el texto del candidato (para aislar la parte semántica de la léxica).
    const hits = await search("arquitectura sistemas distribuidos");
    expect(hits[0].matched).toEqual([]);
    expect(hits[0].score).toBe(0);
  });

  it("una coincidencia literal sube el encaje aunque el significado sea flojo", async () => {
    dbState.scored = [
      { candidate_id: 1, text: "trabaja en Leroy Merlin desde 2020", cos: 0 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: "trabaja en Leroy Merlin desde 2020" },
    ];

    const hits = await search("leroy");
    expect(hits[0].matched).toContain("leroy");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("prefiere como evidencia el fragmento que contiene el término encontrado", async () => {
    dbState.scored = [
      // este es el MÁS parecido semánticamente pero no menciona "python"...
      { candidate_id: 1, text: "gran experiencia profesional en general", cos: 1 },
      // ...este menciona "python" literalmente aunque su coseno sea menor
      { candidate_id: 1, text: "domina python y sql", cos: 0.5 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: "gran experiencia profesional en general domina python y sql" },
    ];

    const hits = await search("python");
    expect(hits[0].evidence).toContain("python");
  });

  it("un candidato sin fragmentos indexados no rompe y puntúa 0", async () => {
    dbState.scored = []; // nada indexado todavía
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: null },
    ];

    const hits = await search("cualquier cosa");
    expect(hits[0].score).toBe(0);
    expect(hits[0].evidence).toBe("");
  });

  it("ordena de mayor a menor encaje y respeta el límite", async () => {
    dbState.scored = [
      { candidate_id: 1, text: "a", cos: 0.4 },
      { candidate_id: 2, text: "b", cos: 1 },
      { candidate_id: 3, text: "c", cos: 0.7 },
    ];
    dbState.candRows = [1, 2, 3].map((id) => ({
      id, full_name: `C${id}`, email: null, headline: null, education: null, source_file: null, raw_text: null,
    }));

    const hits = await search("consulta", 2);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.id)).toEqual([2, 3]); // 2 (cos=1) > 3 (cos=0.7) > 1 (fuera por el límite)
  });
});
