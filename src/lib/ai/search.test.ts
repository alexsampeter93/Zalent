import { describe, expect, it, vi, beforeEach } from "vitest";
import { norm, chunkText, queryTerms, STOPWORDS, search } from "./search";

// search() y matchOffer() hablan con SQLite (getDb) y con el modelo de
// embeddings (embed) — ninguno de los dos existe en un test de Node. Los
// simulamos: la base de datos como una tabla en memoria controlada por SQL,
// y embed() devolviendo vectores que nosotros elegimos (así el "significado"
// del test es determinista, no depende del modelo real).
//
// Truco clave: cosine() en embeddings.ts es un simple producto escalar (no
// normaliza), así que podemos fabricar vectores donde el "coseno" resultante
// sea exactamente el número que queremos probar (p.ej. 0.525), sin tener que
// simular vectores unitarios de verdad.
// Las filas que devolvería SQLite, tipadas igual que las consulta el código
// bajo test (nada de `any`: si mañana cambia una consulta, el test se entera).
interface ChunkRow {
  candidate_id: number;
  text: string;
  vector: string; // JSON con el array de números
}
interface CandRow {
  id: number;
  full_name: string | null;
  email: string | null;
  headline: string | null;
  education: string | null;
  source_file: string | null;
  raw_text: string | null;
}
interface VoteRow {
  candidate_id: number;
  vote: number;
}

const dbState = {
  chunkRows: [] as ChunkRow[],
  candRows: [] as CandRow[],
  votes: [] as VoteRow[],
};

vi.mock("../db", () => ({
  getDb: async () => ({
    select: vi.fn(async (sql: string) => {
      if (sql.includes("candidate_chunks")) return dbState.chunkRows;
      if (sql.includes("FROM feedback")) return dbState.votes;
      if (sql.includes("FROM candidates")) return dbState.candRows;
      return [];
    }),
    execute: vi.fn(async () => {}),
  }),
}));

vi.mock("./embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embeddings")>();
  return { ...actual, embed: vi.fn() };
});

import { embed } from "./embeddings";

function vec(...nums: number[]): Float32Array {
  return Float32Array.from(nums);
}

beforeEach(() => {
  dbState.chunkRows = [];
  dbState.candRows = [];
  dbState.votes = [];
  vi.mocked(embed).mockReset();
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
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      { candidate_id: 1, text: "desarrollador backend con Python", vector: JSON.stringify([1, 0]) }, // cos=1 (máximo)
      { candidate_id: 2, text: "cocinero de restaurante", vector: JSON.stringify([0, 1]) }, // cos=0 (mínimo)
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
    vi.mocked(embed).mockResolvedValue(vec(0.2, 0)); // cos = 0.2, por debajo del suelo 0.3
    dbState.chunkRows = [
      { candidate_id: 1, text: "atencion al cliente en tienda de ropa", vector: JSON.stringify([1, 0]) },
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
    vi.mocked(embed).mockResolvedValue(vec(0, 0)); // cos = 0 con cualquier vector
    dbState.chunkRows = [
      { candidate_id: 1, text: "trabaja en Leroy Merlin desde 2020", vector: JSON.stringify([1, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: "trabaja en Leroy Merlin desde 2020" },
    ];

    const hits = await search("leroy");
    expect(hits[0].matched).toContain("leroy");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("prefiere como evidencia el fragmento que contiene el término encontrado", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      // este es el MÁS parecido semánticamente (cos=1) pero no menciona "python"...
      { candidate_id: 1, text: "gran experiencia profesional en general", vector: JSON.stringify([1, 0]) },
      // ...este menciona "python" literalmente aunque su coseno sea menor
      { candidate_id: 1, text: "domina python y sql", vector: JSON.stringify([0.5, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: "gran experiencia profesional en general domina python y sql" },
    ];

    const hits = await search("python");
    expect(hits[0].evidence).toContain("python");
  });

  it("un candidato sin fragmentos indexados no rompe y puntúa 0", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = []; // nada indexado todavía
    dbState.candRows = [
      { id: 1, full_name: "Ana", email: null, headline: null, education: null, source_file: null, raw_text: null },
    ];

    const hits = await search("cualquier cosa");
    expect(hits[0].score).toBe(0);
    expect(hits[0].evidence).toBe("");
  });

  it("ordena de mayor a menor encaje y respeta el límite", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      { candidate_id: 1, text: "a", vector: JSON.stringify([0.4, 0]) },
      { candidate_id: 2, text: "b", vector: JSON.stringify([1, 0]) },
      { candidate_id: 3, text: "c", vector: JSON.stringify([0.7, 0]) },
    ];
    dbState.candRows = [1, 2, 3].map((id) => ({
      id, full_name: `C${id}`, email: null, headline: null, education: null, source_file: null, raw_text: null,
    }));

    const hits = await search("consulta", 2);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.id)).toEqual([2, 3]); // 2 (cos=1) > 3 (cos=0.7) > 1 (fuera por el límite)
  });
});
