import { describe, expect, it } from "vitest";
import { escapeHtml, buildDossierHtml } from "./dossier";
import type { CandidateExportRow } from "./candidates";

function row(over: Partial<CandidateExportRow> = {}): CandidateExportRow {
  return {
    id: 1, full_name: "Ana Pérez", email: "ana@x.com", phone: "600",
    location: "Bilbao", headline: "Soldadora", years_experience: 6,
    education: "FP", links: null, status: "nuevo", created_at: "2026-01-01 00:00:00",
    source_file: "ana.pdf", skills: "TIG, MIG", languages: "Español",
    tags: null, vacancies: null, ...over,
  };
}

describe("escapeHtml", () => {
  it("neutraliza marcado inyectado desde un CV", () => {
    // Un candidato pone <script> en su nombre: no debe salir como etiqueta.
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("escapa comillas y ampersand", () => {
    expect(escapeHtml('Ana "la jefa" & cía')).toBe("Ana &quot;la jefa&quot; &amp; cía");
  });

  it("convierte null/undefined en cadena vacía", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});

describe("buildDossierHtml", () => {
  it("es un documento HTML completo", () => {
    const html = buildDossierHtml([row()]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<style>"); // estilos en línea, no fichero aparte
  });

  it("pone una ficha por candidato con salto de página", () => {
    const html = buildDossierHtml([row({ id: 1 }), row({ id: 2, full_name: "Bruno" })]);
    expect((html.match(/class="card"/g) ?? [])).toHaveLength(2);
    expect(html).toContain("page-break-after"); // en los estilos
  });

  it("muestra el estado con su etiqueta legible, no la clave interna", () => {
    const html = buildDossierHtml([row({ status: "oferta" })]);
    expect(html).toContain("Oferta enviada");
    expect(html).not.toContain(">oferta<");
  });

  it("omite los campos vacíos en vez de dejar filas huérfanas", () => {
    const html = buildDossierHtml([row({ phone: null, links: null, tags: null })]);
    expect(html).not.toContain("Teléfono");
    expect(html).not.toContain("Enlaces");
    expect(html).not.toContain("Etiquetas");
  });

  it("escapa los datos del candidato (no confía en el CV)", () => {
    const html = buildDossierHtml([row({ full_name: "<b>Ana</b>" })]);
    expect(html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(html).not.toContain("<b>Ana</b>");
  });

  it("usa el título dado (p.ej. el nombre de una oferta)", () => {
    const html = buildDossierHtml([row()], { title: "Soldador/a TIG" });
    expect(html).toContain("<title>Soldador/a TIG</title>");
    expect(html).toContain("Soldador/a TIG</h1>");
  });

  it("cae a un título por defecto si no se da ninguno", () => {
    expect(buildDossierHtml([row()])).toContain("<h1>Candidatos</h1>");
  });

  it("singulariza el contador ('1 candidato', no '1 candidatos')", () => {
    expect(buildDossierHtml([row()])).toContain("1 candidato ·");
    expect(buildDossierHtml([row(), row({ id: 2 })])).toContain("2 candidatos ·");
  });

  it("no revienta con la lista vacía: lo dice en vez de dar un documento en blanco", () => {
    const html = buildDossierHtml([]);
    expect(html).toContain("No hay candidatos");
    expect(html).not.toContain('class="card"');
  });

  it("pluraliza los años ('1 año' vs '6 años')", () => {
    expect(buildDossierHtml([row({ years_experience: 1 })])).toContain("1 año de experiencia");
    expect(buildDossierHtml([row({ years_experience: 6 })])).toContain("6 años de experiencia");
  });
});
