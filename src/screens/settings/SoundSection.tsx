import { useSoundLevel, cue, type SoundLevel } from "../../lib/sound";

// ---------- Sonido ----------
// Sección propia (no escondida dentro de Apariencia) por una razón concreta:
// los sonidos vienen APAGADOS de fábrica, así que si el ajuste no se ve, nadie
// llega a enterarse de que existen.
const OPTS: { key: SoundLevel; label: string; desc: string }[] = [
  {
    key: "off",
    label: "Silencio",
    desc: "Zalent no emite ningún sonido.",
  },
  {
    key: "key",
    label: "Solo lo importante",
    desc: "Suena al desbloquear, al terminar una importación y cuando algo falla.",
  },
  {
    key: "full",
    label: "Todo",
    desc: "Además, la interfaz responde al pulsar y al pasar el ratón por encima.",
  },
];

export function SoundSection() {
  const [level, setLevel] = useSoundLevel();

  return (
    <section className="card">
      <p className="card__title">Sonidos de la interfaz</p>
      <p className="card__intro">
        Avisos cortos que se generan en el momento — no hay archivos de audio ni
        descargas. Vienen <strong>apagados</strong>: en una oficina compartida,
        una app que suena a cada clic puede molestar a quien tengas al lado.
      </p>

      <div className="sound-opts">
        {OPTS.map((o) => (
          <button
            key={o.key}
            className={"sound-opt" + (level === o.key ? " is-on" : "")}
            onClick={() => {
              setLevel(o.key);
              // Se oye al instante lo que se acaba de elegir: probar un ajuste
              // de sonido sin oírlo es adivinar.
              if (o.key !== "off") setTimeout(() => cue("unlocked"), 0);
            }}
          >
            <span className="sound-opt__label">{o.label}</span>
            <span className="sound-opt__desc">{o.desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
