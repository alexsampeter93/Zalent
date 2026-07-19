import { describe, expect, it, vi, beforeEach } from "vitest";
import { deriveRequirements, matchOffer } from "./match";

// Mismo enfoque que en search.test.ts: getDb() y embed() no existen en Node,
// se simulan. Ver el comentario grande en search.test.ts para el porqué.
interface ChunkRow {
  candidate_id: number;
  text: string;
  vector: string; // JSON con el array de números
}
// matchOffer() no lee `email` (a diferencia de search()), así que la fila que
// simulamos es exactamente la que pide su SELECT, ni un campo más.
interface CandRow {
  id: number;
  full_name: string | null;
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

describe("deriveRequirements", () => {
  it("saca las palabras más frecuentes de la oferta, sin stopwords ni palabras cortas", () => {
    const offer = "Buscamos soldador con experiencia en soldadura. Soldadura TIG y soldadura MIG.";
    const reqs = deriveRequirements(offer, 3);
    expect(reqs[0]).toBe("soldadura"); // aparece 3 veces, la más frecuente
  });

  it("respeta el máximo de requisitos", () => {
    const offer = "python java sql docker kubernetes react vue angular";
    expect(deriveRequirements(offer, 3)).toHaveLength(3);
  });

  it("no incluye palabras de menos de 4 letras (p.ej. 'sql', que tiene 3)", () => {
    const offer = "SQL es un requisito, y también R y Go";
    const reqs = deriveRequirements(offer);
    expect(reqs).not.toContain("sql");
    expect(reqs.every((r) => r.length >= 4)).toBe(true);
  });
});

describe("matchOffer", () => {
  it("separa requisitos cumplidos (matched) de los que faltan (missing)", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      { candidate_id: 1, text: "domina python y docker en producción", vector: JSON.stringify([1, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "domina python y docker en producción" },
    ];

    const results = await matchOffer("oferta de backend", ["python", "docker", "kubernetes"]);
    expect(results[0].matched).toEqual(["python", "docker"]);
    expect(results[0].missing).toEqual(["kubernetes"]);
  });

  it("mezcla significado (60%) y cobertura de requisitos (40%) cuando hay requisitos", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0)); // cos=1 con el chunk -> calibSem=1 (máximo, tras el suelo)
    dbState.chunkRows = [
      { candidate_id: 1, text: "python y sql", vector: JSON.stringify([1, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "python y sql" },
    ];

    // Cumple 1 de 2 requisitos -> coverage=0.5. fit = 0.6*1 + 0.4*0.5 = 0.8
    const results = await matchOffer("oferta", ["python", "kubernetes"]);
    expect(results[0].fit).toBeCloseTo(0.8, 5);
  });

  it("sin requisitos, el encaje es solo la parte semántica", async () => {
    vi.mocked(embed).mockResolvedValue(vec(0.5, 0)); // cos = 0.5 con el chunk [1,0]
    dbState.chunkRows = [
      { candidate_id: 1, text: "cualquier cosa", vector: JSON.stringify([1, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "cualquier cosa" },
    ];

    // calibSem = (0.5 - 0.3) / (0.75 - 0.3) = 0.2/0.45 = 0.4444...
    const results = await matchOffer("oferta sin requisitos", []);
    expect(results[0].fit).toBeCloseTo(0.2 / 0.45, 5);
  });

  it("prefiere como evidencia un fragmento que contenga un requisito cumplido", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      // más parecido semánticamente (cos=1) pero no menciona el requisito
      { candidate_id: 1, text: "gran trayectoria profesional", vector: JSON.stringify([1, 0]) },
      // menciona el requisito "docker", aunque su coseno sea menor
      { candidate_id: 1, text: "experto en docker", vector: JSON.stringify([0.5, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "gran trayectoria profesional experto en docker" },
    ];

    const results = await matchOffer("oferta", ["docker"]);
    expect(results[0].evidence).toContain("docker");
  });

  it("ordena de mayor a menor encaje", async () => {
    vi.mocked(embed).mockResolvedValue(vec(1, 0));
    dbState.chunkRows = [
      { candidate_id: 1, text: "sin requisitos", vector: JSON.stringify([0.2, 0]) },
      { candidate_id: 2, text: "python docker kubernetes", vector: JSON.stringify([1, 0]) },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Bajo encaje", headline: null, education: null, source_file: null, raw_text: "sin requisitos" },
      { id: 2, full_name: "Alto encaje", headline: null, education: null, source_file: null, raw_text: "python docker kubernetes" },
    ];

    const results = await matchOffer("oferta", ["python", "docker", "kubernetes"]);
    expect(results.map((r) => r.id)).toEqual([2, 1]);
  });
});
