import { describe, expect, it } from "vitest";
import { assessExtraction } from "./extract-quality";

describe("assessExtraction", () => {
  it("marca como vacío un texto casi sin contenido (PDF escaneado)", () => {
    const r = assessExtraction("   \n  ");
    expect(r.ok).toBe(false);
    expect(r.issue).toBe("empty");
  });

  it("marca como fragmentado un CV con las letras espaciadas", () => {
    // Réplica del caso real: cada letra separada por un espacio.
    const spaced = "V E G O S U P E R M E R C A D O S L E R O Y M E R L I N";
    const r = assessExtraction(spaced);
    expect(r.ok).toBe(false);
    expect(r.issue).toBe("fragmented");
  });

  it("NO marca un CV normal (sin falsos positivos)", () => {
    const normal =
      "Alejandro Sampedro Calo, programador con experiencia en gestión de " +
      "almacén en Vego Supermercados y Leroy Merlin. Manejo de Python, " +
      "JavaScript y SQL. Preparación de pedidos online. Estudios FP Superior.";
    expect(assessExtraction(normal).ok).toBe(true);
  });

  it("un texto normal corto pero con contenido pasa", () => {
    expect(assessExtraction("Juan Pérez, desarrollador backend en Madrid.").ok).toBe(true);
  });
});
