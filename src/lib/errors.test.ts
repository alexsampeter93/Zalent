import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  describeError,
  reportError,
  dismissError,
  dismissAllErrors,
  currentErrors,
  subscribeErrors,
} from "./errors";

// `reportError` escribe siempre en la consola además de avisar por pantalla.
// En los tests eso llenaría la salida de ruido rojo, así que se silencia.
beforeEach(() => {
  dismissAllErrors();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it("saca el mensaje de un Error", () => {
    expect(describeError(new Error("disco lleno"))).toBe("disco lleno");
  });

  it("acepta una cadena pelada", () => {
    // Los comandos de Tauri rechazan con una cadena, no con un Error: si
    // hiciéramos `err.message` a secas, aquí saldría "undefined".
    expect(describeError("no such table: candidates")).toBe(
      "no such table: candidates",
    );
  });

  it("no se rinde con un objeto cualquiera", () => {
    expect(describeError({ code: 14 })).toBe('{"code":14}');
  });

  it("sobrevive a algo que no se puede serializar", () => {
    // Un objeto con un ciclo revienta JSON.stringify. Un módulo de errores que
    // lanza al describir un error sería un chiste malo.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => describeError(cyclic)).not.toThrow();
  });
});

describe("reportError", () => {
  it("guarda la acción que falló y el detalle técnico por separado", () => {
    reportError("No se pudo borrar el candidato", new Error("database is locked"));
    const [e] = currentErrors();
    expect(e.message).toBe("No se pudo borrar el candidato");
    expect(e.detail).toBe("database is locked");
  });

  it("no apila el mismo fallo repetido", () => {
    // Un efecto que reintenta, o el usuario dando al mismo botón: sin esto se
    // le acumulan diez avisos idénticos tapando la pantalla.
    reportError("No se pudo cargar", "timeout");
    reportError("No se pudo cargar", "timeout");
    reportError("No se pudo cargar", "timeout");
    expect(currentErrors()).toHaveLength(1);
  });

  it("sí distingue el mismo mensaje con distinto motivo", () => {
    reportError("No se pudo cargar", "timeout");
    reportError("No se pudo cargar", "database is locked");
    expect(currentErrors()).toHaveLength(2);
  });

  it("deja siempre el rastro en la consola, aunque el aviso se descarte", () => {
    reportError("Fallo", new Error("x"));
    expect(console.error).toHaveBeenCalled();
  });
});

describe("suscripción", () => {
  it("avisa a quien escuche cuando aparece o se cierra un error", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeErrors(listener);

    reportError("Uno", "a");
    expect(listener).toHaveBeenCalledTimes(1);

    dismissError(currentErrors()[0].id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(currentErrors()).toHaveLength(0);

    unsubscribe();
    reportError("Dos", "b");
    expect(listener).toHaveBeenCalledTimes(2); // ya no escucha
  });

  it("devuelve la MISMA referencia mientras no cambie nada", () => {
    // Lo exige `useSyncExternalStore`: si devolviera un array nuevo en cada
    // lectura, React entraría en un bucle infinito de renders.
    reportError("Uno", "a");
    expect(currentErrors()).toBe(currentErrors());
  });

  it("cerrar un aviso no toca a los demás", () => {
    reportError("Uno", "a");
    reportError("Dos", "b");
    dismissError(currentErrors()[0].id);
    expect(currentErrors().map((e) => e.message)).toEqual(["Dos"]);
  });
});
