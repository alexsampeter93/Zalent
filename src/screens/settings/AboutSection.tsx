import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

// ---------- Acerca de ----------
export function AboutSection() {
  // La versión se PIDE a Tauri, no se escribe aquí. Estaba copiada a mano y se
  // quedó en 0.1.0 mientras la app ya iba por otra: una pantalla "Acerca de"
  // que miente sobre la versión es peor que no tenerla, porque es justo donde
  // mira alguien para reportar un fallo. La fuente de verdad es
  // `src-tauri/tauri.conf.json`, que es lo que `getVersion()` devuelve.
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(""));
  }, []);

  return (
    <section className="card about">
      <img
        src="/olaz/coco-laptop-cv.png"
        alt="Olaz trabajando con el portátil"
        className="about__olaz"
      />
      <p className="about__name">Zalent</p>
      {version && <p className="about__ver">Versión {version}</p>}
      <p className="card__intro">
        Gestor de CVs y talento <strong>local-first</strong> con IA. Tus datos,
        en tu equipo. Zalent es un producto de <strong>CocoBrain</strong>, y
        Olaz te da la bienvenida.
      </p>
    </section>
  );
}
