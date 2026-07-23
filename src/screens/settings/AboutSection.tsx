// ---------- Acerca de ----------
export function AboutSection() {
  return (
    <section className="card about">
      <img
        src="/olaz/coco-laptop-cv.png"
        alt="Olaz trabajando con el portátil"
        className="about__olaz"
      />
      <p className="about__name">Zalent</p>
      <p className="about__ver">Versión 0.1.0</p>
      <p className="card__intro">
        Gestor de CVs y talento <strong>local-first</strong> con IA. Tus datos,
        en tu equipo. Zalent es un producto de <strong>BrainCo</strong>; Olaz,
        el coco con cerebro, es su mascota.
      </p>
    </section>
  );
}
