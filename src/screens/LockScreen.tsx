import { useEffect, useRef, useState } from "react";
import { unlock } from "../lib/lock";
import { describeError } from "../lib/errors";
import { cue } from "../lib/sound";

// Pantalla de desbloqueo: pide la contraseña maestra al abrir la app.
//
// Es la PRIMERA cara del producto, así que se cuida como tal: fondo de marca,
// tarjeta oscura con Olaz, y tres estados bien diferenciados (escribiendo,
// error, acceso concedido). El estado "ok" se ve un instante a propósito —
// un desbloqueo instantáneo no da la sensación de que algo se ha abierto.
type Status = "idle" | "checking" | "error" | "ok";

const OK_PAUSE_MS = 620;

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [reveal, setReveal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || status === "checking" || status === "ok") return;
    setStatus("checking");
    setError("");
    try {
      if (await unlock(password)) {
        setStatus("ok");
        cue("unlocked");
        timer.current = window.setTimeout(onUnlock, OK_PAUSE_MS);
      } else {
        setStatus("error");
        setError("Contraseña incorrecta, inténtalo de nuevo");
        cue("denied");
      }
    } catch (err) {
      console.error(err);
      cue("denied");
      // Aquí NO se usa el aviso flotante: la pantalla de bloqueo se pinta
      // antes que el resto de la app, así que el error tiene que verse en la
      // propia pantalla. Y distinguir "contraseña incorrecta" de "la base no
      // se puede abrir" importa mucho cuando no puedes entrar.
      setStatus("error");
      setError("Error al verificar: " + describeError(err));
    }
  }

  const locked = status === "checking" || status === "ok";

  return (
    <div className="lock">
      <div className="lock__veil" />
      <form className={`lock__card lock__card--${status}`} onSubmit={submit}>
        <div className="lock__avatar">
          <img src="/olaz/zalent-mascot-avatar-circle-v2.png" alt="" />
        </div>

        <h1 className="lock__title">Bienvenido de nuevo</h1>
        <p className="lock__sub">
          Introduce tu contraseña maestra para desbloquear Zalent
        </p>

        <label className="lock__label" htmlFor="master-password">
          Contraseña maestra
        </label>
        <div className="lock__field">
          <input
            id="master-password"
            type={reveal ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              // Al volver a escribir, el error deja de tener sentido: el
              // contenido ya no es el que falló.
              if (status === "error") {
                setStatus("idle");
                setError("");
              }
            }}
            disabled={locked}
            autoFocus
            autoComplete="current-password"
          />
          <button
            type="button"
            className="lock__eye"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Ocultar contraseña" : "Mostrar contraseña"}
            tabIndex={-1}
          >
            {reveal ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
          <span className="lock__state" aria-hidden="true">
            {status === "error" && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.01" /></svg>
            )}
            {status === "ok" && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
            )}
          </span>
        </div>

        <p className="lock__msg" role={status === "error" ? "alert" : undefined}>
          {status === "error" && error}
          {status === "ok" && "Desbloqueando…"}
        </p>

        <button
          type="button"
          className="lock__forgot"
          onClick={() => setShowHelp((s) => !s)}
        >
          ¿La olvidaste?
        </button>

        {showHelp && (
          // Honestidad por encima de comodidad: NO hay recuperación, y el
          // usuario tiene que saberlo aquí, no descubrirlo cuando ya es tarde.
          <p className="lock__help">
            No hay forma de recuperarla. La contraseña <strong>es</strong> la
            clave con la que se cifran tus datos: no se guarda en ninguna parte,
            así que nadie —tampoco Zalent— puede devolvértela ni abrir la base
            sin ella.
          </p>
        )}

        <button type="submit" className="lock__go" disabled={locked || !password}>
          {status === "ok" ? "✓ Acceso concedido" : status === "checking" ? "Comprobando…" : "Desbloquear"}
        </button>

        <p className="lock__foot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          Cifrado en tu equipo · sin nube
        </p>
      </form>
    </div>
  );
}
