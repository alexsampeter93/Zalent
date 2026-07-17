import { describe, expect, it } from "vitest";
import { validateExtraction } from "./llm-validate";

const CV = `
  Juan Pérez López
  Ubicación: Madrid
  Puesto actual: Desarrollador Backend
  Licenciatura en Ingeniería Informática
  Habilidades: Python, Docker, SQL
  Idiomas: Inglés, Francés
  8 años de experiencia
`;

describe("validateExtraction", () => {
  it("acepta todos los campos cuando aparecen de verdad en el CV", () => {
    const raw = {
      full_name: "Juan Pérez López",
      location: "Madrid",
      last_position: "Desarrollador Backend",
      years_experience: 8,
      education: "Licenciatura en Ingeniería Informática",
      skills: ["Python", "Docker"],
      languages: ["Inglés"],
    };
    const { fields, report } = validateExtraction(raw, CV);

    expect(fields.full_name).toBe("Juan Pérez López");
    expect(fields.location).toBe("Madrid");
    expect(fields.last_position).toBe("Desarrollador Backend");
    expect(fields.years_experience).toBe(8);
    expect(fields.education).toBe("Licenciatura en Ingeniería Informática");
    expect(fields.skills).toEqual(["Python", "Docker"]);
    expect(fields.languages).toEqual(["Inglés"]);
    expect(report.rejected).toEqual([]);
  });

  it("rechaza un nombre y una ubicación que no están en el CV (anclaje estricto)", () => {
    const raw = {
      full_name: "Nombre Inventado",
      location: "Barcelona",
    };
    const { fields, report } = validateExtraction(raw, CV);

    expect(fields.full_name).toBeNull();
    expect(fields.location).toBeNull();
    expect(report.rejected.some((r) => r.includes("full_name"))).toBe(true);
    expect(report.rejected.some((r) => r.includes("location"))).toBe(true);
  });

  it("acepta un puesto con una palabra añadida (anclaje indulgente, no exige coincidencia exacta)", () => {
    const raw = { last_position: "Desarrollador Backend Senior" };
    const { fields } = validateExtraction(raw, CV);
    expect(fields.last_position).toBe("Desarrollador Backend Senior");
  });

  it("rechaza un puesto que no tiene relación con el CV", () => {
    const raw = { last_position: "Cirujano cardiovascular" };
    const { fields, report } = validateExtraction(raw, CV);
    expect(fields.last_position).toBeNull();
    expect(report.rejected.some((r) => r.includes("last_position"))).toBe(true);
  });

  it("descarta años de experiencia fuera de rango sensato (caso real: 165 años)", () => {
    const raw = { years_experience: 165 };
    const { fields, report } = validateExtraction(raw, CV);
    expect(fields.years_experience).toBeNull();
    expect(report.rejected.some((r) => r.includes("years_experience"))).toBe(true);
  });

  it("filtra skills e idiomas uno por uno, no todo o nada", () => {
    const raw = {
      skills: ["Python", "Rust (no aparece)"],
      languages: ["Inglés", "Klingon"],
    };
    const { fields, report } = validateExtraction(raw, CV);
    expect(fields.skills).toEqual(["Python"]);
    expect(fields.languages).toEqual(["Inglés"]);
    expect(report.rejected.some((r) => r.includes("Rust"))).toBe(true);
    expect(report.rejected.some((r) => r.includes("Klingon"))).toBe(true);
  });

  it("reconoce alias de nombres de campo que usan los modelos pequeños", () => {
    const raw = { fullName: "Juan Pérez López", city: "Madrid", role: "Desarrollador Backend" };
    const { fields } = validateExtraction(raw, CV);
    expect(fields.full_name).toBe("Juan Pérez López");
    expect(fields.location).toBe("Madrid");
    expect(fields.last_position).toBe("Desarrollador Backend");
  });

  it("aplana objetos anidados (p.ej. {name, degree} en education) a texto", () => {
    const raw = { education: { degree: "Ingeniería Informática", institution: "no importa" } };
    const { fields } = validateExtraction(raw, CV);
    expect(fields.education).toContain("Ingeniería Informática");
  });

  it("elimina duplicados de skills ignorando mayúsculas y acentos", () => {
    const raw = { skills: ["Python", "python", "PYTHON"] };
    const { fields } = validateExtraction(raw, CV);
    expect(fields.skills).toEqual(["Python"]);
  });

  it("devuelve todos los campos vacíos y un rechazo explicativo si no hay respuesta parseable", () => {
    const { fields, report } = validateExtraction(null, CV);
    expect(fields.full_name).toBeNull();
    expect(fields.skills).toEqual([]);
    expect(report.rejected).toEqual(["respuesta no parseable"]);
  });
});
