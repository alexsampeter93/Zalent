import { describe, expect, it } from "vitest";
import { guessFields } from "./parse";

describe("guessFields", () => {
  it("extrae email, teléfono y LinkedIn de un CV típico", () => {
    const text = `
      Ana García Pérez
      ana.garcia@example.com | +34 612 345 678
      linkedin.com/in/anagarcia

      Ubicación: Madrid

      Experiencia
      2019 - 2023 Desarrolladora en Empresa X

      Formación
      Grado en Ingeniería Informática

      Idiomas
      Inglés, Francés
    `;
    const fields = guessFields(text);

    expect(fields.email).toBe("ana.garcia@example.com");
    expect(fields.phone.replace(/\D/g, "")).toBe("34612345678");
    expect(fields.links).toContain("linkedin.com/in/anagarcia");
    expect(fields.location).toBe("Madrid");
    expect(fields.education).toBe("Universitarios");
    expect(fields.years_experience).toBe("4");
    expect(fields.languages).toBe("Inglés, Francés");
  });

  it("prefiere la ubicación explícita sobre una ciudad detectada en otra parte del texto", () => {
    const text = "Ubicación: Vigo\nAntes trabajó en una oficina de Madrid.";
    const fields = guessFields(text);
    expect(fields.location).toBe("Vigo");
  });

  it("cae a la primera ciudad conocida cuando no hay etiqueta explícita", () => {
    const text = "Reside y trabaja en Barcelona desde hace años.";
    const fields = guessFields(text);
    expect(fields.location).toBe("Barcelona");
  });

  it("no encuentra teléfono ni email cuando no hay ninguno en el texto", () => {
    const fields = guessFields("Un CV sin datos de contacto ni ubicación.");
    expect(fields.email).toBe("");
    expect(fields.phone).toBe("");
    expect(fields.links).toBe("");
    expect(fields.location).toBe("");
  });

  it("extrae la sección de habilidades como lista", () => {
    const text = "Habilidades:\nPython, SQL, Docker\n\nOtra sección";
    const fields = guessFields(text);
    expect(fields.skills).toBe("Python, SQL, Docker");
  });

  it("adivina el nombre desde el texto cuando empieza con Nombre Apellido", () => {
    // La heurística para en la primera palabra que no empieza en mayúscula.
    const text = "Marta López Fernández\ndesarrolladora backend";
    const fields = guessFields(text);
    expect(fields.full_name).toBe("Marta López Fernández");
  });

  it("no confunde un titular en mayúsculas con el nombre", () => {
    const text = "PROGRAMADOR SENIOR\nCon 5 años de experiencia";
    const fields = guessFields(text, "cv_juan_perez_2023.pdf");
    // el texto no aporta nombre (todo en mayúsculas) → recae en el nombre de archivo
    expect(fields.full_name).toBe("Juan Perez");
  });

  it("recurre al nombre del archivo si el texto no empieza con una palabra capitalizada", () => {
    const fields = guessFields("sin cabecera reconocible al principio.", "CV - Laura Martinez - final.pdf");
    expect(fields.full_name).toBe("Laura Martinez");
  });

  it("no inventa un nombre si ni el texto ni el archivo lo permiten", () => {
    const fields = guessFields("texto sin nombre", "documento123.pdf");
    expect(fields.full_name).toBe("");
  });

  it("calcula los años de experiencia por frase literal", () => {
    const fields = guessFields("Tengo 7 años de experiencia como analista.");
    expect(fields.years_experience).toBe("7");
  });

  it("calcula los años de experiencia sumando rangos de fechas solapados", () => {
    const text = `
      Experiencia
      2015 - 2018 Puesto A
      2017 - 2020 Puesto B (solapa con el anterior)
      Formación
      2010 - 2014 Universidad
    `;
    const fields = guessFields(text);
    // 2015-2020 fusionado = 5 años; los años de formación (2010-2014) no cuentan
    expect(fields.years_experience).toBe("5");
  });
});
