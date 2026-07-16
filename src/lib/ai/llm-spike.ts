// PRUEBA TEMPORAL (spike): ¿es viable un LLM local para rellenar fichas?
//
// El WebGPU ya lo sabemos: funciona. Lo que NO sabemos es el único número que
// decide: SEGUNDOS POR CV en esta máquina (gráfica integrada Intel Xe-LPG).
//   ~5-15 s/CV  → viable: 200 CVs = media hora de trabajo de fondo.
//   ~60 s/CV    → inviable: 200 CVs = 3 horas.
//
// Modelo: Qwen2.5-0.5B-Instruct (Apache 2.0 → se puede vender). Pequeño a
// propósito: extraer campos de un texto es tarea fácil, no hace falta más.
//
// TODO ocurre en local: el modelo se descarga una vez y el CV va HACIA él.
// Ningún dato del candidato sale del equipo.
//
// Este fichero es desechable: si el número sale mal, se borra entero.

import { pipeline, env, type TextGenerationPipeline } from "@huggingface/transformers";
import { validateExtraction, type ExtractedFields } from "./llm-validate";

// Dos tallas para comparar. La pequeña destroza palabras en español
// ("Fisiotérpida") y se salta el esquema; la mediana debería ir mejor, pero
// es ~3× más lenta y ~1 GB de descarga. Ese es el intercambio a medir.
export const MODELS = {
  "0.5B": "onnx-community/Qwen2.5-0.5B-Instruct",
  "1.5B": "onnx-community/Qwen2.5-1.5B-Instruct",
} as const;

export type ModelSize = keyof typeof MODELS;

// Dónde corre el modelo. No es un ajuste de rendimiento: es la variable que
// separa "falla por hardware" de "falla por incapacidad del modelo".
//   webgpu → rápido, pero con límites de búfer (el 1.5B da std::bad_alloc).
//   wasm   → CPU + RAM del sistema: sin esos límites, pero lento.
export type Device = "webgpu" | "wasm";

export interface LlmSpikeReport {
  loadMs: number; // cuánto tarda en arrancar (una vez por sesión)
  inferMs: number; // cuánto tarda POR CV ← el número que decide
  raw: string; // lo que devolvió tal cual (para juzgar calidad)
  parsed: Record<string, unknown> | null; // ¿era JSON válido?
  jsonOk: boolean;
  fields: ExtractedFields | null; // la ficha YA validada
  rejected: string[]; // qué se le ha tirado y por qué
  error: string;
}

// Le damos el ESQUEMA EXACTO con un ejemplo. Un modelo de 0,5B no deduce el
// formato de una descripción: hay que enseñárselo. (En la 1ª prueba nos
// devolvió `education` como lista de objetos porque no se lo mostramos.)
const SCHEMA_EXAMPLE = `{
  "full_name": "Ana López Ruiz",
  "location": "Valencia",
  "last_position": "Enfermera",
  "years_experience": 6,
  "education": "Grado en Enfermería",
  "skills": ["triaje", "curas"],
  "languages": ["Español", "Inglés"]
}`;

// Le PROHIBIMOS inventar: si un dato no está en el CV, null. Aun así no nos
// fiaremos — de eso se encarga el validador. El prompt reduce la basura;
// el validador es quien la para.
function buildPrompt(cvText: string): string {
  return (
    "Extrae los datos de este CV. Responde SOLO con un objeto JSON con esta " +
    "forma EXACTA (mismas claves, mismos tipos):\n\n" +
    SCHEMA_EXAMPLE +
    "\n\nREGLAS:\n" +
    "- Si un dato NO aparece en el CV, pon null. No lo inventes ni lo deduzcas.\n" +
    "- Copia literalmente lo que pone el CV. No añadas nada.\n" +
    "- years_experience: un número entre 1 y 50. Si no lo sabes, null.\n" +
    "- education: UNA sola cadena de texto, no una lista.\n" +
    "- No repitas datos.\n\n" +
    "CV:\n" +
    cvText.slice(0, 3000) // recortamos: el contexto cuesta tiempo
  );
}

// Una caché por talla+dispositivo: así puedes alternar sin recargar.
const pipes = new Map<string, Promise<TextGenerationPipeline>>();

export async function runLlmSpike(
  cvText: string,
  size: ModelSize = "0.5B",
  device: Device = "webgpu",
  onStep?: (s: string) => void,
): Promise<LlmSpikeReport> {
  const report: LlmSpikeReport = {
    loadMs: 0,
    inferMs: 0,
    raw: "",
    parsed: null,
    jsonOk: false,
    fields: null,
    rejected: [],
    error: "",
  };

  env.allowLocalModels = false;

  try {
    // --- Carga (solo la primera vez: descarga ~400 MB y queda cacheado) ---
    const t0 = performance.now();
    const key = `${size}:${device}`;
    if (!pipes.has(key)) {
      onStep?.(`Cargando ${size} en ${device} (la 1ª vez tarda)…`);
      pipes.set(
        key,
        pipeline("text-generation", MODELS[size], {
          device,
          dtype: "q4", // cuantizado a 4 bits: 4× menos memoria que mover
          progress_callback: (p: unknown) => {
            const info = p as { status?: string; progress?: number };
            if (info.status === "progress" && info.progress != null) {
              onStep?.(`Descargando ${size}… ${Math.round(info.progress)}%`);
            }
          },
        }) as Promise<TextGenerationPipeline>,
      );
    }
    const pipe = await pipes.get(key)!;
    report.loadMs = Math.round(performance.now() - t0);

    // --- La medición que importa: un CV real, de principio a fin ---
    onStep?.("Leyendo el CV…");
    const t1 = performance.now();
    const out = await pipe(
      [
        { role: "system", content: "Eres un extractor de datos. Respondes solo JSON." },
        { role: "user", content: buildPrompt(cvText) },
      ],
      {
        max_new_tokens: 256,
        do_sample: false, // sin azar: mismo CV → misma ficha, siempre
        // Penaliza repetir lo ya dicho. Es lo que rompe el bucle que vimos
        // ("Universidad Arturo Michelena" dos veces seguidas): la decodificación
        // voraz se queda atrapada repitiendo, y esto le encarece hacerlo.
        repetition_penalty: 1.15,
        no_repeat_ngram_size: 4,
      },
    );
    report.inferMs = Math.round(performance.now() - t1);

    // La respuesta viene envuelta; nos quedamos con el último turno.
    const arr = out as unknown as {
      generated_text: string | { role: string; content: string }[];
    }[];
    const gen = arr[0]?.generated_text;
    report.raw =
      typeof gen === "string" ? gen : (gen?.[gen.length - 1]?.content ?? "");

    // ¿Nos ha dado JSON de verdad? Los LLM pequeños lo envuelven en ```json.
    const m = report.raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        report.parsed = JSON.parse(m[0]);
        report.jsonOk = true;
      } catch {
        report.error = "Devolvió algo parecido a JSON pero no parsea.";
      }
    } else {
      report.error = "No devolvió JSON.";
    }

    // La red de seguridad: nada entra en la ficha sin comprobarse contra el CV.
    const { fields, report: v } = validateExtraction(report.parsed, cvText);
    report.fields = fields;
    report.rejected = v.rejected;
  } catch (e) {
    // Si la carga falló, sacamos la promesa ROTA de la caché. Si no, el
    // siguiente intento devolvería el mismo fallo sin llegar a reintentar.
    pipes.delete(`${size}:${device}`);
    report.error = String(e);
  }

  return report;
}
