import { describe, expect, it, vi, beforeEach } from "vitest";
import { deriveRequirements, matchOffer } from "./match";

// Mismo enfoque que en search.test.ts: getDb(), embed() e invoke() no existen
// en Node y se simulan. El coseno llega ya calculado desde Rust, así que el
// test lo fija directamente en vez de fabricar vectores que lo produzcan.
// Ver el comentario grande en search.test.ts para el porqué.
interface ScoredRow {
  candidate_id: number;
  text: string;
  cos: number;
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
const dbState = {
  scored: [] as ScoredRow[],
  candRows: [] as CandRow[],
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
  vi.mocked(embed).mockResolvedValue(Float32Array.from([1, 0]));
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
    dbState.scored = [
      { candidate_id: 1, text: "domina python y docker en producción", cos: 1 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "domina python y docker en producción" },
    ];

    const results = await matchOffer("oferta de backend", ["python", "docker", "kubernetes"]);
    expect(results[0].matched).toEqual(["python", "docker"]);
    expect(results[0].missing).toEqual(["kubernetes"]);
  });

  it("mezcla significado (60%) y cobertura de requisitos (40%) cuando hay requisitos", async () => {
    dbState.scored = [
      // cos=1 -> calibSem=1 (el máximo, una vez descontado el suelo de ruido)
      { candidate_id: 1, text: "python y sql", cos: 1 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "python y sql" },
    ];

    // Cumple 1 de 2 requisitos -> coverage=0.5. fit = 0.6*1 + 0.4*0.5 = 0.8
    const results = await matchOffer("oferta", ["python", "kubernetes"]);
    expect(results[0].fit).toBeCloseTo(0.8, 5);
  });

  it("sin requisitos, el encaje es solo la parte semántica", async () => {
    dbState.scored = [{ candidate_id: 1, text: "cualquier cosa", cos: 0.5 }];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "cualquier cosa" },
    ];

    // calibSem = (0.5 - 0.3) / (0.75 - 0.3) = 0.2/0.45 = 0.4444...
    const results = await matchOffer("oferta sin requisitos", []);
    expect(results[0].fit).toBeCloseTo(0.2 / 0.45, 5);
  });

  it("prefiere como evidencia un fragmento que contenga un requisito cumplido", async () => {
    dbState.scored = [
      // más parecido semánticamente pero no menciona el requisito
      { candidate_id: 1, text: "gran trayectoria profesional", cos: 1 },
      // menciona el requisito "docker", aunque su coseno sea menor
      { candidate_id: 1, text: "experto en docker", cos: 0.5 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Ana", headline: null, education: null, source_file: null, raw_text: "gran trayectoria profesional experto en docker" },
    ];

    const results = await matchOffer("oferta", ["docker"]);
    expect(results[0].evidence).toContain("docker");
  });

  it("ordena de mayor a menor encaje", async () => {
    dbState.scored = [
      { candidate_id: 1, text: "sin requisitos", cos: 0.2 },
      { candidate_id: 2, text: "python docker kubernetes", cos: 1 },
    ];
    dbState.candRows = [
      { id: 1, full_name: "Bajo encaje", headline: null, education: null, source_file: null, raw_text: "sin requisitos" },
      { id: 2, full_name: "Alto encaje", headline: null, education: null, source_file: null, raw_text: "python docker kubernetes" },
    ];

    const results = await matchOffer("oferta", ["python", "docker", "kubernetes"]);
    expect(results.map((r) => r.id)).toEqual([2, 1]);
  });
});
