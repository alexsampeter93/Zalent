import { STATUSES } from "../../lib/candidates";
import { openCvFile } from "../../lib/files";
import { reportError } from "../../lib/errors";
import { OlazSprite } from "../../components/OlazSprite";
import { EmptyState } from "../../components/EmptyState";
import { CandidateFieldsForm, Info } from "../../components/CandidateFields";
import { MatchTag } from "../../components/MatchTag";
import { highlight } from "../../components/highlight";
import { formatDateTime, initials, RELEVANT_FLOOR, matchBand } from "../../lib/display";
import type { CandidatesState } from "./useCandidates";

// La pantalla Candidatos, ya SOLO presentación: tabla + filtros + selección
// múltiple + vista maestro-detalle (ficha con edición, ofertas, voto,
// etiquetas, notas). Todo el estado y la lógica viven en `useCandidates`.
export function CandidatesScreen({
  cand,
  onNavigateToImport,
}: {
  cand: CandidatesState;
  onNavigateToImport: () => void;
}) {
  const {
    showCandReminder, unclassifiedCount,
    doSearch, query, setQuery, clearSearch, searching,
    selectedId, rows, searchMode, relevantCount, filtersActive, visibleRows,
    filterVacancy, setFilterVacancy, vacancyList, allTags, filterTag, setFilterTag,
    filterMissing, setFilterMissing, filterNotes, setFilterNotes, sortBy, setSortBy,
    selectionMode, setSelectionMode, exitSelection, onAutoClassify, classifying, classifyMsg,
    selectedIds, toggleSelectAll, onBulkAddToVacancy, confirmBulkDelete,
    setConfirmBulkDelete, onBulkDelete, bulkDeleting,
    searchStatus, toggleSelect, selectCandidate, membership,
    backToList,
    detail, editing, confirmingDelete, confirmingAnon, startEdit,
    setConfirmingAnon, anonymizing, onAnonymize, setConfirmingDelete,
    candOffers, onOfferStageChange, votes, onVote,
    tags, onRemoveTag, tagInput, setTagInput, onAddTag, selectedHit,
    deleting, onDelete, editForm, setEditField, savingEdit, onUpdate, setEditing,
    notes, newNote, setNewNote, onAddNote, savingNote, onDeleteNote,
    exporting, exportMsg, onExport,
  } = cand;

  return (
    <div className="screen screen--wide screen--fill">
      {showCandReminder && unclassifiedCount > 0 && (
        <div className="cand-toast" key={unclassifiedCount}>
          <img src="/olaz/coco-thinking-cv.png" alt="" aria-hidden="true" />
          <span>
            Recuerda: tienes <strong>{unclassifiedCount}</strong>{" "}
            {unclassifiedCount === 1 ? "CV" : "CVs"} sin clasificar.
          </span>
        </div>
      )}
      <div className="screen__head">
        <h1 className="screen__title">Candidatos</h1>
        <p className="screen__sub">
          Busca por significado y haz clic para ver la ficha.
        </p>
      </div>

      <form className="searchbar" onSubmit={doSearch}>
        <OlazSprite
          className="olaz-perch"
          name="olaz-peek"
          frames={5}
          fps={8}
          width={116}
          height={91}
          sequence={[
            3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 1, 2, 3, 3, 3, 3, 3, 3,
            3, 3, 3, 3, 3, 3, 4, 5, 5, 4,
          ]}
          alt=""
        />
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Búsqueda semántica local… (p.ej. gestión de almacén y pedidos online)"
        />
        {query && (
          <button type="button" className="searchbar__clear" onClick={clearSearch} aria-label="Limpiar">
            ×
          </button>
        )}
        <button type="submit" disabled={searching}>
          {searching ? "…" : "Buscar"}
        </button>
      </form>
      {!searching && selectedId == null && rows.length > 0 && (
        searchMode ? (
          <div className="results-head">
            <img
              src={`/olaz/${relevantCount > 0 ? "coco-thumbsup-cv" : "coco-thinking-cv"}.png`}
              alt="Olaz"
            />
            <div>
              <strong>
                {relevantCount > 0
                  ? `Olaz encontró ${relevantCount} con relación`
                  : "Olaz no ve ningún candidato con relación"}
              </strong>
              <span>
                {relevantCount > 0
                  ? `para «${query}», ordenados por encaje`
                  : `para «${query}» — quizá no tengas CVs de ese perfil`}
              </span>
            </div>
          </div>
        ) : (
          <p className="screen__sub" style={{ margin: 0 }}>
            {filtersActive
              ? `${visibleRows.length} de ${rows.length} candidatos`
              : `${rows.length} candidatos`}
          </p>
        )
      )}
      {!searching && selectedId == null && rows.length > 0 && (
        <div className="filters">
          <select
            value={filterVacancy === "all" ? "all" : String(filterVacancy)}
            onChange={(e) =>
              setFilterVacancy(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
          >
            <option value="all">Todas las ofertas</option>
            {vacancyList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
          {allTags.length > 0 && (
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            >
              <option value="all">Todas las etiquetas</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
          <select
            value={filterMissing}
            onChange={(e) =>
              setFilterMissing(e.target.value as "none" | "email" | "name")
            }
          >
            <option value="none">Todos los datos</option>
            <option value="name">Sin nombre</option>
            <option value="email">Sin email</option>
          </select>
          <select
            value={filterNotes}
            onChange={(e) =>
              setFilterNotes(e.target.value as "all" | "with" | "without")
            }
          >
            <option value="all">Notas: todas</option>
            <option value="with">Con notas</option>
            <option value="without">Sin notas</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as "recientes" | "antiguos" | "az" | "za",
              )
            }
            title="Ordenar"
          >
            <option value="recientes">Más recientes</option>
            <option value="antiguos">Más antiguos</option>
            <option value="az">Nombre A–Z</option>
            <option value="za">Nombre Z–A</option>
          </select>
          {filtersActive && (
            <button
              className="btn-sm btn-ghost"
              onClick={() => {
                setFilterVacancy("all");
                setFilterMissing("none");
                setFilterTag("all");
                setFilterNotes("all");
              }}
            >
              Limpiar filtros
            </button>
          )}
          <div className="filters__spacer" />
          <button
            className={"btn-sm" + (selectionMode ? " btn-ghost" : "")}
            onClick={() =>
              selectionMode ? exitSelection() : setSelectionMode(true)
            }
          >
            {selectionMode ? "Cancelar selección" : "Seleccionar"}
          </button>
          <button
            className="btn-sm"
            onClick={onExport}
            disabled={exporting || visibleRows.length === 0}
            title={
              selectedIds.size > 0
                ? `Exporta a CSV los ${selectedIds.size} candidatos seleccionados`
                : "Exporta a CSV los candidatos que estás viendo, con los filtros aplicados"
            }
          >
            {exporting ? "Exportando…" : "⬇ Exportar CSV"}
          </button>
          <button
            className="btn-sm classify-btn"
            onClick={onAutoClassify}
            disabled={classifying}
            title="Detecta idiomas, carnets, estudios y experiencia de cada CV"
          >
            {classifying ? "Clasificando…" : "✨ Clasificar automáticamente"}
          </button>
          {classifyMsg && <span className="classify-msg">{classifyMsg}</span>}
          {exportMsg && <span className="classify-msg">{exportMsg}</span>}
        </div>
      )}

      {selectionMode && !searching && selectedId == null && (
        <div className="bulk-bar">
          <label className="bulk-bar__all">
            <input
              type="checkbox"
              checked={
                visibleRows.length > 0 &&
                visibleRows.every((r) => selectedIds.has(r.id))
              }
              onChange={() => toggleSelectAll(visibleRows.map((r) => r.id))}
            />
            Todos
          </label>
          <span className="bulk-bar__count">
            {selectedIds.size} seleccionados
          </span>
          <div className="filters__spacer" />
          <select
            className="btn-sm"
            value=""
            disabled={selectedIds.size === 0 || vacancyList.length === 0}
            onChange={(e) => {
              if (e.target.value) onBulkAddToVacancy(Number(e.target.value));
            }}
          >
            <option value="">＋ Añadir a oferta…</option>
            {vacancyList.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
          {confirmBulkDelete ? (
            <>
              <span className="bulk-bar__confirm">
                ¿Eliminar {selectedIds.size}? (borra sus CVs)
              </span>
              <button
                className="btn-sm btn-danger"
                onClick={onBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button
                className="btn-sm btn-ghost"
                onClick={() => setConfirmBulkDelete(false)}
              >
                No
              </button>
            </>
          ) : (
            <button
              className="btn-sm btn-danger-ghost"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={selectedIds.size === 0}
            >
              Eliminar
            </button>
          )}
        </div>
      )}
      <div className="screen-scroll">
      {searching ? (
        <div className="search-loading">
          <img src="/olaz/coco-magnifier-cv.png" alt="Olaz buscando" />
          <p>{searchStatus || "Buscando por significado…"}</p>
        </div>
      ) : selectedId == null ? (
        /* ---------- Vista TABLA (3a) ---------- */
        rows.length === 0 ? (
          searchMode ? (
            <div className="card">
              <p className="card__intro">Sin resultados. Prueba otra búsqueda.</p>
            </div>
          ) : (
            <EmptyState
              image="coco-magnifier-cv"
              title="Aún no hay candidatos"
              subtitle="Arrastra tus CVs (PDF o Word) y Zalent los convierte en fichas que puedes buscar por significado."
              action={{
                label: "Ir a Importar",
                onClick: onNavigateToImport,
              }}
            />
          )
        ) : visibleRows.length === 0 ? (
          <div className="card">
            <p className="card__intro">Ningún candidato con estos filtros.</p>
          </div>
        ) : (
          <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {selectionMode && <th className="col-check"></th>}
                    <th>Candidato</th>
                    <th>Puesto</th>
                    {searchMode && <th className="col-match">Encaje</th>}
                    <th>Ofertas</th>
                    <th>Fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        selectionMode && selectedIds.has(r.id)
                          ? "is-selected"
                          : undefined
                      }
                      onClick={() =>
                        selectionMode
                          ? toggleSelect(r.id)
                          : selectCandidate(r.id)
                      }
                    >
                      {selectionMode && (
                        <td className="col-check">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(r.id)}
                            onChange={() => toggleSelect(r.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                      )}
                      <td>
                        <div className="cellname">
                          <span className="avatar">{initials(r.full_name)}</span>
                          <div>
                            <div className="cellname__name">
                              {r.full_name || "(sin nombre)"}
                            </div>
                            <div className="cellname__sub">{r.email || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td>{r.headline || "—"}</td>
                      {searchMode && (
                        <td className="col-match">
                          {r.match != null ? <MatchTag score={r.match} /> : "—"}
                        </td>
                      )}
                      <td>
                        {membership.get(r.id)?.size ? (
                          <span className="offers-count">
                            {membership.get(r.id)!.size}
                          </span>
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      <td className="cell-muted">{r.source_file || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )
      ) : (
        /* ---------- Vista MAESTRO-DETALLE (3b) ---------- */
        <div className="md">
          <aside className="md__list">
            <button className="backlink" onClick={backToList}>
              ← Volver a la lista
            </button>
            {rows.map((r) => (
              <button
                key={r.id}
                className={"md__row" + (selectedId === r.id ? " active" : "")}
                onClick={() => selectCandidate(r.id)}
              >
                <span className="avatar">{initials(r.full_name)}</span>
                <span className="md__row-name">
                  {r.full_name || "(sin nombre)"}
                </span>
                {r.match != null && r.match >= RELEVANT_FLOOR && (
                  <span className={"match match--sm " + matchBand(r.match).cls}>
                    {(r.match * 100).toFixed(0)}%
                  </span>
                )}
              </button>
            ))}
          </aside>

          <div className="md__detail">
            {detail && (
              <section className="card">
                <div className="detail-head">
                  <p className="card__title">
                    {detail.full_name || "(sin nombre)"}
                  </p>
                  {!editing && !confirmingDelete && !confirmingAnon && (
                    <div className="detail-actions">
                      <button className="btn-secondary" onClick={startEdit}>
                        Editar
                      </button>
                      {detail.full_name !== "[anonimizado]" && (
                        <button
                          className="btn-secondary"
                          onClick={() => setConfirmingAnon(true)}
                          title="Quitar datos personales (RGPD), conservando lo agregado"
                        >
                          Anonimizar
                        </button>
                      )}
                      <button className="btn-danger" onClick={() => setConfirmingDelete(true)}>
                        Borrar
                      </button>
                    </div>
                  )}
                </div>

                {confirmingAnon && (
                  <div className="confirm-delete confirm-anon">
                    <p className="confirm-delete__text">
                      ¿Anonimizar a{" "}
                      <strong>{detail.full_name || "(sin nombre)"}</strong>? Se
                      quitan nombre, email, teléfono, ubicación, enlaces, el
                      texto y el archivo del CV. Se conservan puesto, skills,
                      años, etiquetas y su sitio en el pipeline.{" "}
                      <strong>No se puede deshacer.</strong>
                    </p>
                    <div className="actions">
                      <button
                        className="btn-secondary"
                        onClick={() => setConfirmingAnon(false)}
                        disabled={anonymizing}
                      >
                        Cancelar
                      </button>
                      <button onClick={onAnonymize} disabled={anonymizing}>
                        {anonymizing ? "Anonimizando…" : "Sí, anonimizar"}
                      </button>
                    </div>
                  </div>
                )}

                {!editing && (
                  <div className="offers-box">
                    <div className="offers-box__label">
                      Ofertas ({candOffers.length})
                    </div>
                    {candOffers.length === 0 ? (
                      <p className="offers-box__empty">
                        No está en ninguna oferta. Asígnalo desde{" "}
                        <strong>Vacantes</strong>.
                      </p>
                    ) : (
                      <ul className="offers-list">
                        {candOffers.map((o) => (
                          <li key={o.id} className="offers-row">
                            <span className="offers-row__title">{o.title}</span>
                            <select
                              className={"stage-select st-" + o.stage}
                              value={o.stage}
                              onChange={(e) =>
                                onOfferStageChange(o.id, e.target.value)
                              }
                            >
                              {STATUSES.map((s) => (
                                <option key={s.key} value={s.key}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {!editing && (
                  <div className="vote-box">
                    <span className="vote-box__label">¿Encaja este perfil?</span>
                    <div className="vote-btns">
                      <button
                        className={
                          "vote-btn vote-up" +
                          (votes.get(selectedId ?? -1) === 1 ? " is-on" : "")
                        }
                        onClick={() => onVote(1)}
                        title="Me encaja (subirá perfiles parecidos)"
                      >
                        👍
                      </button>
                      <button
                        className={
                          "vote-btn vote-down" +
                          (votes.get(selectedId ?? -1) === -1 ? " is-on" : "")
                        }
                        onClick={() => onVote(-1)}
                        title="No me encaja (bajará perfiles parecidos)"
                      >
                        👎
                      </button>
                    </div>
                  </div>
                )}

                {!editing && (
                  <div className="tags-box">
                    <div className="tags-box__label">Etiquetas</div>
                    <div className="tags-row">
                      {tags.map((t) => (
                        <span key={t} className="tag-chip">
                          {t}
                          <button
                            className="tag-chip__x"
                            onClick={() => onRemoveTag(t)}
                            aria-label={`Quitar ${t}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {tags.length === 0 && (
                        <span className="tags-empty">Sin etiquetas todavía</span>
                      )}
                    </div>
                    <input
                      className="tag-input"
                      list="tag-suggestions"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onAddTag(tagInput);
                        }
                      }}
                      placeholder="Añadir etiqueta (p.ej. carnet C+E) y Enter"
                    />
                    <datalist id="tag-suggestions">
                      {allTags.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </div>
                )}

                {selectedHit && selectedHit.score >= RELEVANT_FLOOR && !editing &&
                  (selectedHit.why || selectedHit.evidence) && (
                    <div className="why">
                      <div className="why__h">
                        Por qué encaja · {(selectedHit.score * 100).toFixed(0)}%
                      </div>
                      {selectedHit.why && <p className="why__text">{selectedHit.why}</p>}
                      {selectedHit.evidence && (
                        <>
                          <div className="why__label">Fragmento del CV</div>
                          <p className="why__quote">
                            {highlight(selectedHit.evidence, query)}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                {confirmingDelete && (
                  <div className="confirm-delete">
                    <p className="confirm-delete__text">
                      ¿Borrar a <strong>{detail.full_name || "(sin nombre)"}</strong>{" "}
                      definitivamente? Se eliminarán su ficha, skills, idiomas y
                      notas. Esta acción no se puede deshacer.
                    </p>
                    <div className="actions">
                      <button className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                        Cancelar
                      </button>
                      <button className="btn-danger" onClick={onDelete} disabled={deleting}>
                        {deleting ? "Borrando…" : "Sí, borrar"}
                      </button>
                    </div>
                  </div>
                )}

                {editing ? (
                  <>
                    <CandidateFieldsForm form={editForm} onChange={setEditField} />
                    <div className="actions">
                      <button className="btn-secondary" onClick={() => setEditing(false)} disabled={savingEdit}>
                        Cancelar
                      </button>
                      <button onClick={onUpdate} disabled={savingEdit}>
                        {savingEdit ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="detail-grid">
                    <Info label="Email" value={detail.email} />
                    <Info label="Teléfono" value={detail.phone} />
                    <Info label="Ubicación" value={detail.location} />
                    <Info label="Último puesto" value={detail.headline} />
                    <Info label="Años de experiencia" value={detail.years_experience?.toString() ?? null} />
                    <Info label="Estudios" value={detail.education} />
                    <Info label="Enlaces" value={detail.links} />
                    <Info label="Skills" value={detail.skills.join(", ") || null} />
                    <Info label="Idiomas" value={detail.languages.join(", ") || null} />
                  </div>
                )}

                {!editing && (
                  <div className="cv-actions">
                    {detail.file_path ? (
                      <button
                        className="btn-secondary"
                        onClick={async () => {
                          try {
                            await openCvFile(detail.file_path!);
                          } catch (e) {
                            reportError("No se pudo abrir el CV", e);
                          }
                        }}
                      >
                        📄 Ver CV original
                      </button>
                    ) : (
                      <span className="cv-actions__none">
                        (CV importado antes de guardar el archivo original)
                      </span>
                    )}
                    {detail.raw_text && (
                      <details className="raw-details">
                        <summary>Ver texto extraído</summary>
                        <textarea
                          className="cv-text"
                          readOnly
                          value={detail.raw_text}
                          rows={10}
                        />
                      </details>
                    )}
                  </div>
                )}

                <p className="card__title notes-title">Notas ({notes.length})</p>
                <div className="note-add">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Escribe una nota sobre este candidato…"
                    rows={3}
                  />
                  <button onClick={onAddNote} disabled={savingNote || newNote.trim() === ""}>
                    {savingNote ? "Añadiendo…" : "Añadir nota"}
                  </button>
                </div>
                {notes.length === 0 ? (
                  <p className="card__intro">Sin notas todavía.</p>
                ) : (
                  <ul className="note-list">
                    {notes.map((n) => (
                      <li key={n.id} className="note-item">
                        <div className="note-item__head">
                          <span className="note-date">{formatDateTime(n.created_at)}</span>
                          <button
                            className="note-del"
                            onClick={() => onDeleteNote(n.id)}
                            title="Eliminar nota"
                            aria-label="Eliminar nota"
                          >
                            ×
                          </button>
                        </div>
                        <div className="note-body">{n.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
