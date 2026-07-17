import { describe, expect, it } from "vitest";
import {
  detectLanguages,
  detectLicenses,
  detectStudies,
  detectYears,
  normalize,
  suggestTags,
} from "./classify";

describe("normalize", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalize("Ingeniería Informática")).toBe("ingenieria informatica");
  });
});

describe("detectLanguages", () => {
  it("detecta varios idiomas presentes en el texto", () => {
    expect(detectLanguages(normalize("Habla inglés, francés y catalán"))).toEqual([
      "Inglés",
      "Francés",
      "Catalán",
    ]);
  });

  it("no detecta idiomas que no aparecen", () => {
    expect(detectLanguages(normalize("Solo habla español"))).toEqual([]);
  });
});

describe("detectStudies", () => {
  it("se queda con el nivel más alto cuando hay varios", () => {
    const t = normalize("ESO, Bachillerato, Grado en Ingeniería y Máster en IA");
    expect(detectStudies(t)).toBe("Máster");
  });

  it("detecta doctorado por encima de todo", () => {
    expect(detectStudies(normalize("Doctorado en Física"))).toBe("Doctorado");
  });

  it("devuelve null si no hay ninguna señal de estudios", () => {
    expect(detectStudies(normalize("Curso de cocina rápida de fin de semana"))).toBeNull();
  });
});

describe("detectLicenses", () => {
  it("detecta el carné de conducir por distintas formas de escribirlo", () => {
    expect(detectLicenses(normalize("Carnet de conducir B"))).toContain("Carné de conducir");
    expect(detectLicenses(normalize("Permiso B1"))).toContain("Carné de conducir");
  });

  it("detecta carnet C+E y ADR de forma independiente", () => {
    const t = normalize("Carnet C+E, certificado ADR");
    const out = detectLicenses(t);
    expect(out).toContain("Carnet C+E");
    expect(out).toContain("ADR");
  });

  it("no detecta nada si no hay ninguna licencia mencionada", () => {
    expect(detectLicenses(normalize("Experiencia en atención al cliente"))).toEqual([]);
  });
});

describe("detectYears", () => {
  it("prioriza la frase literal de años de experiencia", () => {
    expect(detectYears(normalize("Tengo 6 años de experiencia en ventas"))).toBe(6);
  });

  it("descarta cifras fuera de rango en la frase literal y recae en los rangos", () => {
    // "165 años de experiencia" es el caso real que rompía la ficha antes del validador
    const t = normalize("165 años de experiencia\nExperiencia\n2020 - 2022 puesto");
    expect(detectYears(t)).toBe(2);
  });

  it("suma rangos de fechas cuando no hay frase literal", () => {
    const t = normalize("Experiencia\n2018 - 2021 Puesto A\n2021 - 2023 Puesto B");
    expect(detectYears(t)).toBe(5);
  });

  it("interpreta 'actualidad' como el año en curso", () => {
    const t = normalize(`Experiencia\n${new Date().getFullYear() - 3} - actualidad Puesto`);
    expect(detectYears(t)).toBe(3);
  });

  it("devuelve null si no hay ninguna señal de experiencia", () => {
    expect(detectYears(normalize("CV sin fechas ni años mencionados"))).toBeNull();
  });
});

describe("suggestTags", () => {
  it("combina idiomas, estudios y experiencia en una sola lista", () => {
    const text = "Grado en Informática. Inglés avanzado. 2015 - 2019 puesto de experiencia laboral";
    const tags = suggestTags(text, null);
    expect(tags).toContain("Inglés");
    expect(tags).toContain("Estudios: Universitarios");
  });

  it("usa los años estructurados si se le pasan, en vez de recalcularlos del texto", () => {
    const tags = suggestTags("Sin fechas en el texto", 12);
    expect(tags).toContain("10+ años exp");
  });

  it("no repite etiquetas duplicadas", () => {
    const tags = suggestTags("Inglés, inglés, INGLÉS", null);
    expect(tags.filter((t) => t === "Inglés")).toHaveLength(1);
  });
});
