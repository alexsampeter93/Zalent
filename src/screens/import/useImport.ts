import { useEffect, useRef, useState } from "react";
import { extractText } from "../../lib/extract";
import { assessExtraction } from "../../lib/extract-quality";
import { guessFields } from "../../lib/parse";
import { saveCandidate } from "../../lib/candidates";
import { saveCvFile } from "../../lib/files";
import { hasMasterPassword } from "../../lib/lock";
import {
  ollamaExtract,
  isModelReady,
  pullModel,
  AI_MODEL,
  type PullProgress,
} from "../../lib/ai/ollama";
import { type CandidateForm, emptyForm, splitList } from "../../lib/candidate-form";
import { reportError } from "../../lib/errors";
import { cue } from "../../lib/sound";

// TODO EL ESTADO Y LA LÓGICA de la pantalla Importar, en un hook. Vive en App
// (se llama desde App), así que su estado PERSISTE al navegar a otra pantalla y
// volver — igual que antes de partir el "God file". `ImportScreen` solo pinta.
export function useImport({
  active,
  onImported,
}: {
  active: boolean; // ¿es la pantalla visible ahora? (para re-chequear el modelo)
  onImported: () => Promise<void> | void; // refrescar candidatos tras importar
}) {
  // Importar uno y revisar
  const [fileName, setFileName] = useState("");
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const [extractError, setExtractError] = useState("");
  // Aviso cuando el CV se leyó mal (poco texto / fragmentado). No es un error
  // —la ficha se guarda igual—, pero el usuario debe saber que quedará floja.
  const [extractWarning, setExtractWarning] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [form, setForm] = useState<CandidateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Importar en lote
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(0);
  const [batchErrors, setBatchErrors] = useState<{ name: string; error: string }[]>([]);
  const [batchKey, setBatchKey] = useState(0);
  const [showBatchMsg, setShowBatchMsg] = useState(false);
  const [importReminder, setImportReminder] = useState(false);
  // IA en la importación: opcional, apagada por defecto (es lenta: ~30-40s
  // por CV). El modelo NO viene en el instalador — se descarga la primera
  // vez que el usuario la enciende. Si algo falla, el resto de Zalent sigue
  // igual ("la IA mejora el producto, no es el producto").
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAiImport, setUseAiImport] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullPct, setPullPct] = useState(0);
  const [pullMsg, setPullMsg] = useState("");
  const [dragOver, setDragOver] = useState<null | "single" | "batch">(null);
  const folderRef = useRef<HTMLInputElement>(null);
  // Sin contraseña maestra, ni la BD ni los CVs se cifran (S3/Diario 54 lo
  // avisa en Privacidad; esto avisa justo ANTES de que entren datos reales,
  // que es el momento en que de verdad importa). null = aún sin comprobar.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);

  // El mensaje "Importados X de Y" se muestra un momento y se desvanece.
  useEffect(() => {
    if (!showBatchMsg) return;
    const t = setTimeout(() => setShowBatchMsg(false), 4500);
    return () => clearTimeout(t);
  }, [showBatchMsg]);

  // ¿Está el modelo ya descargado? Se comprueba al entrar en Importar.
  useEffect(() => {
    if (!active) return;
    isModelReady().then(setAiAvailable);
  }, [active]);

  // ¿Hay contraseña maestra activa? Se re-comprueba cada vez que se entra en
  // Importar, para que el aviso desaparezca solo en cuanto el usuario la active.
  useEffect(() => {
    if (!active) return;
    hasMasterPassword().then(setHasPassword).catch(() => setHasPassword(null));
  }, [active]);

  // El aviso "sin clasificar" solo vive en Importar, tras importar.
  useEffect(() => {
    if (!active) setImportReminder(false);
  }, [active]);

  function set<K extends keyof CandidateForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Descarga el modelo la primera vez (~4,7 GB). El progreso llega desde Rust
  // por eventos; sin eso el usuario vería la app parada varios minutos.
  async function downloadModel() {
    setPulling(true);
    setPullPct(0);
    setPullMsg("Conectando…");
    try {
      await pullModel((p: PullProgress) => {
        if (p.error) {
          setPullMsg("Error: " + p.error);
          return;
        }
        if (p.total > 0) {
          setPullPct(Math.round((p.completed / p.total) * 100));
          const gb = (n: number) => (n / 1073741824).toFixed(1);
          setPullMsg(`Descargando… ${gb(p.completed)} / ${gb(p.total)} GB`);
        } else {
          setPullMsg(p.status || "Preparando…");
        }
      });
      const ready = await isModelReady();
      setAiAvailable(ready);
      if (ready) {
        setUseAiImport(true); // si se ha molestado en bajarlo, lo quiere usar
        setPullMsg("");
      }
    } catch (e) {
      console.error(e);
      setPullMsg("No se pudo descargar el modelo. ¿Hay conexión?");
    } finally {
      setPulling(false);
    }
  }

  // ¿Es un CV admitido? (PDF o Word). Filtra lo que se suelte por arrastre.
  function isCvFile(f: File): boolean {
    return /\.(pdf|docx)$/i.test(f.name);
  }

  // Núcleo de "importar y revisar uno" (lo usan el botón y el arrastre).
  async function processSingleFile(file: File) {
    setFileName(file.name);
    setCurrentFile(file);
    setExtractedText("");
    setExtractError("");
    setExtractWarning("");
    setSaveError("");
    setExtracting(true);
    try {
      const text = await extractText(file);
      setExtractedText(text);
      setExtractWarning(assessExtraction(text).message);
      setForm({ ...emptyForm, ...guessFields(text, file.name) });
    } catch (err) {
      setExtractError(String(err));
    } finally {
      setExtracting(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await processSingleFile(file);
  }

  // Núcleo del "importar en lote".
  async function processBatch(files: File[]) {
    if (files.length === 0) return;
    setBatchRunning(true);
    setBatchTotal(files.length);
    setBatchDone(0);
    setBatchErrors([]);
    const errors: { name: string; error: string }[] = [];
    // Dos fallos que NO abortan la importación de un CV pero que el usuario
    // tiene que saber. Se cuentan y se avisan UNA vez al final: uno por CV
    // sería una avalancha de avisos en un lote de 200.
    let aiFailures = 0;
    let fileFailures = 0;
    let poorExtraction = 0; // CVs de los que apenas se sacó texto o salió roto
    for (const file of files) {
      try {
        const text = await extractText(file);
        if (!assessExtraction(text).ok) poorExtraction++;
        const g = guessFields(text, file.name);

        // Base: las reglas de siempre. Fiables para email/teléfono/enlaces,
        // flojas para puesto/estudios/skills (el techo que documentamos).
        let fullName = g.full_name;
        let location = g.location;
        let headline = ""; // las reglas nunca tuvieron este campo
        let education = g.education;
        let skills = splitList(g.skills);
        let languages = splitList(g.languages);

        // IA opcional: solo mejora los campos de LENGUAJE (donde las reglas
        // fallan). Los años de experiencia NUNCA vienen del LLM — eso es
        // aritmética, y ya la calcula detectYears() de forma determinista
        // (ver Diario, entrada 29.4). Si la IA falla, seguimos con las
        // reglas sin más: degradar con elegancia, nunca romper la importación.
        if (useAiImport) {
          try {
            const ai = await ollamaExtract(AI_MODEL, text);
            if (ai.fields) {
              if (ai.fields.full_name) fullName = ai.fields.full_name;
              if (ai.fields.location) location = ai.fields.location;
              if (ai.fields.last_position) headline = ai.fields.last_position;
              if (ai.fields.education) education = ai.fields.education;
              if (ai.fields.skills.length > 0) skills = ai.fields.skills;
              if (ai.fields.languages.length > 0) languages = ai.fields.languages;
            }
          } catch (err) {
            // La IA es una MEJORA sobre las reglas, no un requisito: el CV se
            // importa igual con lo que sacaron las reglas. Pero si el usuario
            // encendió la IA y no está haciendo nada, tiene que enterarse.
            aiFailures++;
            console.error("ollamaExtract:", err);
          }
        }

        let filePath: string | null = null;
        try {
          filePath = await saveCvFile(file);
        } catch (err) {
          // Grave y silencioso hasta ahora: la ficha se guardaba igual, pero
          // con `file_path` nulo. Es decir, el candidato aparecía en la lista y
          // su CV original NO estaba en ninguna parte.
          fileFailures++;
          console.error("save_cv:", err);
        }
        const gy = Number(g.years_experience);
        await saveCandidate({
          full_name: fullName, email: g.email, phone: g.phone,
          location, headline,
          years_experience: g.years_experience && !Number.isNaN(gy) ? gy : null,
          education,
          links: g.links, raw_text: text, source_file: file.name,
          file_path: filePath,
          skills, languages,
        });
      } catch (err) {
        errors.push({ name: file.name, error: String(err) });
      }
      setBatchDone((d) => d + 1);
    }
    if (fileFailures > 0) {
      reportError(
        `Se guardaron ${fileFailures} fichas sin su archivo de CV: no se pudo copiar el original al almacén`,
        "revisa el espacio en disco y los permisos de la carpeta de Zalent",
      );
    }
    if (aiFailures > 0) {
      reportError(
        `La IA no pudo analizar ${aiFailures} CV(s); se importaron solo con lo que detectaron las reglas`,
        "comprueba en Ajustes que el modelo está descargado y disponible",
      );
    }
    if (poorExtraction > 0) {
      reportError(
        `De ${poorExtraction} CV(s) apenas se pudo leer texto (o salió fragmentado); se importaron pero su ficha quedará floja y la búsqueda puede no encontrarlos`,
        "suelen ser PDFs escaneados/foto o plantillas con las letras muy espaciadas; mejor un CV con texto normal",
      );
    }
    setBatchErrors(errors);
    setBatchRunning(false);
    setBatchKey((k) => k + 1);
    setShowBatchMsg(true);
    setImportReminder(true);
    // Un lote de 200 CVs con IA tarda horas: el aviso sonoro importa de
    // verdad aquí, porque nadie se queda mirando la barra de progreso.
    cue(errors.length > 0 ? "failed" : "imported");
    await onImported();
  }

  async function onBatchChange(e: React.ChangeEvent<HTMLInputElement>) {
    await processBatch(Array.from(e.target.files ?? []).filter(isCvFile));
  }

  // Arrastre de archivos a las zonas de importación.
  function onDropFiles(e: React.DragEvent, mode: "single" | "batch") {
    e.preventDefault();
    setDragOver(null);
    const files = Array.from(e.dataTransfer.files).filter(isCvFile);
    if (files.length === 0) return;
    if (mode === "single") processSingleFile(files[0]);
    else processBatch(files);
  }

  async function onSave() {
    setSaving(true);
    setSaveError("");
    try {
      const raw = form.years_experience.trim().replace(",", ".");
      const years = raw === "" ? null : Number(raw);
      let filePath: string | null = null;
      if (currentFile) {
        try {
          filePath = await saveCvFile(currentFile);
        } catch (err) {
          // La ficha se guarda igual (no se pierde lo que ya has revisado),
          // pero sin el archivo original: hay que decirlo.
          reportError(
            "La ficha se guardará, pero no se pudo copiar el CV original al almacén",
            err,
          );
        }
      }
      const cleanYears = years !== null && !Number.isNaN(years) ? years : null;
      await saveCandidate({
        full_name: form.full_name, email: form.email, phone: form.phone,
        location: form.location, headline: form.headline,
        years_experience: cleanYears,
        education: form.education, links: form.links,
        raw_text: extractedText, source_file: fileName,
        file_path: filePath,
        skills: splitList(form.skills), languages: splitList(form.languages),
      });
      setForm(emptyForm);
      setExtractedText("");
      setFileName("");
      setCurrentFile(null);
      setFileKey((k) => k + 1);
      await onImported();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return {
    fileName, currentFile, extracting, extractedText, extractError, extractWarning, fileKey,
    form, saving, saveError,
    batchRunning, batchTotal, batchDone, batchErrors, batchKey, showBatchMsg,
    importReminder,
    aiAvailable, useAiImport, setUseAiImport, pulling, pullPct, pullMsg,
    hasPassword,
    dragOver, setDragOver, folderRef,
    set, downloadModel, onFileChange, onBatchChange, onDropFiles, onSave,
  };
}

export type ImportState = ReturnType<typeof useImport>;
