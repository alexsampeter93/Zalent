import { useEffect, useState } from "react";
import { dbEncryptionStatus } from "../../lib/lock";
import { formatBytes } from "../../lib/system";
import { Row } from "./Row";

// ---------- Privacidad ----------
export function PrivacySection() {
  // Aviso de copias sin cifrar: la privacidad se ve aquí, así que si hay datos
  // legibles sin contraseña en el disco, hay que decirlo también en esta pestaña
  // (no solo en Seguridad). El borrado sigue viviendo solo en Seguridad.
  const [backups, setBackups] = useState<{ list: string[]; bytes: number } | null>(null);
  useEffect(() => {
    dbEncryptionStatus()
      .then((s) => setBackups({ list: s.backups, bytes: s.backup_bytes }))
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="set-hero">
        <span className="set-hero__big">100%</span>
        <div>
          <div className="set-hero__t">Datos en tu equipo</div>
          <div className="set-hero__s">
            Cero llamadas a servidores externos. Nada va a la nube ni a terceros.
          </div>
        </div>
      </div>
      <div className="set-rows">
        <Row label="Ubicación de los datos" value="Este equipo" />
        <Row label="Telemetría / analítica" value="Ninguna" />
        <Row label="Modelo de IA" value="Local (offline)" />
        <Row label="Borrado de candidatos" value="Real, sin papelera" />
      </div>
      {backups && backups.list.length > 0 && (
        <div className="confirm-delete confirm-anon">
          <p className="confirm-delete__text">
            ⚠️ Hay{" "}
            {backups.list.length === 1 ? "una copia" : `${backups.list.length} copias`}{" "}
            <strong>sin cifrar</strong> de la base de datos en el disco (
            {formatBytes(backups.bytes)}). Mientras existan, tus datos{" "}
            <strong>siguen siendo legibles sin contraseña</strong>. Revísalas y
            bórralas en <strong>Ajustes → Seguridad</strong>.
          </p>
        </div>
      )}
    </>
  );
}
