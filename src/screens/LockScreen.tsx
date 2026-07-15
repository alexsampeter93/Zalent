import { useState } from "react";
import { unlock } from "../lib/lock";

// Pantalla de desbloqueo: pide la contraseña maestra al abrir la app.
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    setError("");
    try {
      if (await unlock(password)) onUnlock();
      else setError("Contraseña incorrecta.");
    } catch (err) {
      console.error(err);
      setError("Error al verificar.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="lock">
      <form className="lock__card" onSubmit={submit}>
        <img src="/olaz/coco-thinking-cv.png" alt="" className="lock__olaz" />
        <h1 className="lock__title">Zalent</h1>
        <p className="lock__sub">
          Introduce tu contraseña maestra para desbloquear.
        </p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña maestra"
          autoFocus
        />
        {error && <p className="lock__error">{error}</p>}
        <button type="submit" disabled={checking || !password}>
          {checking ? "Comprobando…" : "Desbloquear"}
        </button>
      </form>
    </div>
  );
}
