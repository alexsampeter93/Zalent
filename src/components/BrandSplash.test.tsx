// @vitest-environment jsdom
//
// El splash tapa TODA la pantalla mientras se muestra. Si por lo que sea no
// llega a llamar a `onDone`, no es un fallo cosmético: la app queda
// inutilizable (pasó de verdad — el candado quedaba debajo y no se podía ni
// escribir la contraseña maestra). Estos tests fijan lo único que de verdad
// importa de este componente: que SIEMPRE se quita de en medio.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, waitFor, fireEvent } from "@testing-library/react";
import { BrandSplash } from "./BrandSplash";

// jsdom no implementa `decode()` ni `matchMedia`; sin estos dobles el
// componente ni siquiera arrancaría su secuencia.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    writable: true,
    value: () => Promise.resolve(),
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("BrandSplash", () => {
  it("termina llamando a onDone", async () => {
    const onDone = vi.fn();
    render(<BrandSplash onDone={onDone} />);

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  // La regresión concreta: en desarrollo React monta → desmonta → vuelve a
  // montar. Con un `useRef` que sobrevivía al desmontaje, el segundo montaje
  // salía antes de programar los temporizadores y el splash se quedaba
  // clavado para siempre. StrictMode reproduce ese doble montaje.
  it("también termina bajo StrictMode (doble montaje en desarrollo)", async () => {
    const onDone = vi.fn();
    render(
      <StrictMode>
        <BrandSplash onDone={onDone} />
      </StrictMode>,
    );

    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("se puede saltar pulsando encima", async () => {
    const onDone = vi.fn();
    const { container } = render(<BrandSplash onDone={onDone} />);

    fireEvent.click(container.querySelector(".brand-splash")!);

    await vi.advanceTimersByTimeAsync(600);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
