import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CandidateDetail } from "../candidates";

// La sustancia de estas ayudas son los PROMPTS: qué contexto se le da al modelo
// y con qué instrucciones de anclaje. Eso sí se puede probar sin el LLM real:
// se simula `ollamaGenerate` y se inspecciona con qué se le llamó.
vi.mock("./ollama", () => ({ ollamaGenerate: vi.fn(async () => ({ text: "", ms: 0, error: "" })) }));

import { ollamaGenerate } from "./ollama";
import {
  candidateContext,
  summarizeCandidate,
  interviewQuestions,
  rejectionEmail,
} from "./assist";

const CAND: CandidateDetail = {
  id: 1,
  full_name: "Ana Pérez",
  email: "ana@x.com",
  phone: null,
  location: "Bilbao",
  headline: "Soldadora TIG",
  years_experience: 6,
  education: "FP Soldadura",
  links: null,
  source_file: "ana.pdf",
  file_path: null,
  raw_text: "Experiencia soldando estructuras en el astillero de Cádiz.",
  status: "nuevo",
  created_at: "2026-01-01 00:00:00",
  skills: ["Soldadura TIG", "Lectura de planos"],
  languages: ["Español", "Inglés"],
};

// Devuelve [system, prompt, temperature] de la última llamada a ollamaGenerate.
function lastCall(): [string, string, number] {
  const calls = vi.mocked(ollamaGenerate).mock.calls;
  return calls[calls.length - 1] as [string, string, number];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("candidateContext", () => {
  it("incluye los campos de la ficha que existen", () => {
    const ctx = candidateContext(CAND);
    expect(ctx).toContain("Ana Pérez");
    expect(ctx).toContain("Soldadora TIG");
    expect(ctx).toContain("6"); // años
    expect(ctx).toContain("Soldadura TIG, Lectura de planos");
    expect(ctx).toContain("Español, Inglés");
  });

  it("omite los campos vacíos en vez de escribir 'null'", () => {
    // El teléfono es null: no debe colarse "Teléfono: null" en el prompt.
    const ctx = candidateContext({ ...CAND, phone: null, education: null });
    expect(ctx).not.toContain("null");
    expect(ctx).not.toContain("Estudios");
  });

  it("recorta el CV a 6000 caracteres (contexto = tiempo de CPU)", () => {
    const largo = { ...CAND, raw_text: "a".repeat(9000) };
    const ctx = candidateContext(largo);
    expect(ctx).toContain("a".repeat(6000));
    expect(ctx).not.toContain("a".repeat(6001));
  });
});

describe("summarizeCandidate", () => {
  it("usa temperatura 0 (un resumen debe ser reproducible)", async () => {
    await summarizeCandidate(CAND);
    const [, , temp] = lastCall();
    expect(temp).toBe(0);
  });

  it("el system le prohíbe inventar y el prompt lleva el contexto del candidato", async () => {
    await summarizeCandidate(CAND);
    const [system, prompt] = lastCall();
    expect(system.toLowerCase()).toContain("únicamente");
    expect(prompt).toContain("Ana Pérez");
  });

  it("el system pide copiar los nombres propios sin alterarlos", async () => {
    // Regresión de un caso real: el modelo cambió "Supermercados" por
    // "supermercades". No se puede garantizar en algo generativo, pero el
    // prompt debe pedirlo explícitamente. Ver Diario, entrada 53.
    await summarizeCandidate(CAND);
    const [system] = lastCall();
    expect(system.toLowerCase()).toContain("exactamente");
  });
});

describe("interviewQuestions", () => {
  it("usa algo de temperatura (variedad en las sugerencias)", async () => {
    await interviewQuestions(CAND);
    const [, , temp] = lastCall();
    expect(temp).toBeGreaterThan(0);
  });

  it("pide preguntas basadas en el perfil, no genéricas", async () => {
    await interviewQuestions(CAND);
    const [system, prompt] = lastCall();
    expect(system.toLowerCase()).toContain("genéric");
    expect(prompt).toContain("Soldadora TIG");
  });
});

describe("rejectionEmail", () => {
  it("el system prohíbe dar motivos concretos del rechazo", async () => {
    await rejectionEmail(CAND);
    const [system] = lastCall();
    expect(system.toLowerCase()).toContain("no das motivos");
  });

  it("mete el nombre del candidato y, si se da, el puesto", async () => {
    await rejectionEmail(CAND, "Soldador/a de estructuras");
    const [, prompt] = lastCall();
    expect(prompt).toContain("Ana Pérez");
    expect(prompt).toContain("Soldador/a de estructuras");
  });

  it("funciona sin puesto (no todos los rechazos son de una oferta concreta)", async () => {
    await rejectionEmail(CAND);
    const [, prompt] = lastCall();
    expect(prompt).toContain("Ana Pérez");
    expect(prompt).not.toContain('"undefined"');
  });
});
