import { OlazSprite } from "../../components/OlazSprite";
import { CandidateFieldsForm } from "../../components/CandidateFields";
import type { ImportState } from "./useImport";

// La pantalla Importar, ya SOLO presentación: recibe el estado y los handlers
// del hook `useImport` (que vive en App), más lo compartido con Candidatos
// (el contador de "sin clasificar" y el auto-clasificador).
export function ImportScreen({
  imp,
  unclassifiedCount,
  onAutoClassify,
  classifying,
}: {
  imp: ImportState;
  unclassifiedCount: number;
  onAutoClassify: () => void;
  classifying: boolean;
}) {
  const {
    fileName, extracting, extractedText, extractError, extractWarning, fileKey,
    form, saving, saveError,
    batchRunning, batchTotal, batchDone, batchErrors, batchKey, showBatchMsg,
    importReminder,
    aiAvailable, useAiImport, setUseAiImport, pulling, pullPct, pullMsg,
    dragOver, setDragOver, folderRef,
    set, downloadModel, onFileChange, onBatchChange, onDropFiles, onSave,
  } = imp;

  return (
    <div className="screen">
      <div className="screen__head">
        <h1 className="screen__title">Importar</h1>
        <p className="screen__sub">
          Arrastra tus CVs y se convierten en fichas. Todo local, nada sale a la nube.
        </p>
      </div>

      {aiAvailable ? (
        <label className="ai-import-toggle">
          <input
            type="checkbox"
            checked={useAiImport}
            onChange={(e) => setUseAiImport(e.target.checked)}
            disabled={batchRunning}
          />
          <span>
            Rellenar con IA (más lento — ~30-40 s por CV, pero saca puesto,
            estudios y skills que las reglas se dejan)
          </span>
        </label>
      ) : (
        <div className="ai-download">
          {pulling ? (
            <>
              <div className="import-progress__bar">
                <div
                  className="import-progress__fill"
                  style={{ width: `${pullPct}%` }}
                />
              </div>
              <span className="ai-download__msg">{pullMsg}</span>
            </>
          ) : (
            <>
              <span className="ai-download__msg">
                ¿Quieres que la IA rellene las fichas (puesto, estudios,
                skills)? Hay que descargar el modelo una vez: <strong>4,7 GB</strong>.
                Se queda en tu equipo y funciona sin internet a partir de entonces.
              </span>
              <button className="btn-sm" onClick={downloadModel} disabled={batchRunning}>
                Descargar modelo de IA
              </button>
              {pullMsg && <span className="ai-download__msg">{pullMsg}</span>}
            </>
          )}
        </div>
      )}

      {/* Zona de arrastre principal (lote) */}
      <label
        className={
          "dropzone" +
          (dragOver === "batch" ? " is-over" : "") +
          (batchRunning ? " is-busy" : "")
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (!batchRunning) setDragOver("batch");
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => !batchRunning && onDropFiles(e, "batch")}
      >
        <input
          key={batchKey}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={onBatchChange}
          disabled={batchRunning}
          hidden
        />
        {/* Olaz corriendo con los CVs: encaja con "arrastra tus CVs aquí".
            Se acelera mientras importa — el movimiento cuenta que está
            trabajando, sin necesidad de otro texto. */}
        <OlazSprite
          name="olaz-run"
          frames={7}
          fps={batchRunning ? 14 : 9}
          height={132}
          className="dropzone__olaz"
          alt="Olaz corriendo con los CVs"
        />
        <div className="dropzone__title">Arrastra tus CVs aquí</div>
        <div className="dropzone__sub">
          o <span className="dropzone__link">haz clic para elegir</span>
          <span className="dropzone__dot">·</span> PDF o Word
          <span className="dropzone__dot">·</span> varios a la vez
        </div>
      </label>

      {/* Importar una carpeta entera (usa webkitdirectory) */}
      <button
        type="button"
        className="folder-btn"
        onClick={() => folderRef.current?.click()}
        disabled={batchRunning}
      >
        📁 …o importar una carpeta entera de CVs
      </button>
      <input
        ref={folderRef}
        type="file"
        multiple
        onChange={onBatchChange}
        hidden
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
      />

      {/* Progreso del lote */}
      {batchRunning && (
        <div className="import-progress">
          <div className="import-progress__bar">
            <div
              className="import-progress__fill"
              style={{
                width: `${batchTotal ? (batchDone / batchTotal) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="import-progress__label">
            Procesando {batchDone} / {batchTotal}…
          </div>
        </div>
      )}
      {!batchRunning && batchTotal > 0 && showBatchMsg && (
        <p className="db-ok db-ok--fade">
          ✅ Importados {batchTotal - batchErrors.length} de {batchTotal}
          {batchErrors.length > 0 && ` · ${batchErrors.length} con error`}
        </p>
      )}
      {batchErrors.length > 0 && (
        <ul className="batch-errors">
          {batchErrors.map((er) => (
            <li key={er.name}>{er.name}: {er.error}</li>
          ))}
        </ul>
      )}

      {importReminder && unclassifiedCount > 0 && (
        <div className="classify-reminder">
          <span>
            Tienes <strong>{unclassifiedCount}</strong>{" "}
            {unclassifiedCount === 1 ? "CV sin clasificar" : "CVs sin clasificar"}.
          </span>
          <button
            className="btn-sm classify-btn"
            onClick={onAutoClassify}
            disabled={classifying}
          >
            {classifying ? "Clasificando…" : "✨ Clasificar automáticamente"}
          </button>
        </div>
      )}

      {/* Opción secundaria: importar uno y revisarlo */}
      <div className="import-alt">
        <span className="import-alt__text">
          ¿Prefieres revisar los datos antes de guardar?
        </span>
        <label
          className={"btn-file" + (dragOver === "single" ? " is-over" : "")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("single");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDropFiles(e, "single")}
        >
          <input
            key={fileKey}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onFileChange}
            hidden
          />
          Importar uno y revisar
        </label>
      </div>
      {extracting && <p className="card__intro">Leyendo el documento…</p>}
      {extractError && <p className="db-error">Error: {extractError}</p>}
      {extractWarning && (
        <div className="confirm-delete confirm-anon">
          <p className="confirm-delete__text">⚠️ {extractWarning}</p>
        </div>
      )}

      {extractedText && (
        <section className="card">
          <p className="card__title">Revisar la ficha</p>
          <p className="card__intro">
            Auto-rellenado desde <strong>{fileName}</strong> (
            {extractedText.length} caracteres). Revisa y completa.
          </p>
          <CandidateFieldsForm form={form} onChange={set} />
          <div className="actions">
            <button onClick={onSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar candidato"}
            </button>
          </div>
          {saveError && <p className="db-error">Error: {saveError}</p>}
          <details className="raw-details">
            <summary>Ver texto extraído del CV</summary>
            <textarea className="cv-text" readOnly value={extractedText} rows={10} />
          </details>
        </section>
      )}
    </div>
  );
}
