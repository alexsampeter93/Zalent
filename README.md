# Zalent

**Gestor de CVs y talento local-first con IA.** De escritorio, privado por diseño, para cualquier tipo de empresa.

Zalent ayuda a equipos de RRHH y agencias de selección a **importar CVs, buscarlos por significado y encontrar al mejor candidato para cada oferta** — todo funcionando en local, sin coste y sin que los datos salgan del equipo.

## Características

- 📥 **Importación masiva** de CVs (PDF, Word, escaneados con OCR) → fichas estructuradas.
- 🔎 **Búsqueda semántica** en lenguaje natural, con evidencia resaltada.
- 🎯 **Matching CV↔oferta**: pega una vacante y obtén candidatos rankeados, con encaje y huecos explicados.
- 🗂️ **Pipeline** tipo kanban por vacante + notas con historial.
- 🧠 **Aprende** de tus preferencias con feedback 👍/👎.
- 🤖 **Asistente IA local** (opcional): resumen, preguntas de entrevista y borrador de rechazo por candidato.
- 🔒 **Local-first / RGPD**: cifrado en reposo con contraseña maestra, borrado real, todo en tu equipo.

## Estado

Fases 0-7 completas (ver hoja de ruta en [`CLAUDE.md`](CLAUDE.md)). Diario técnico completo en [`docs/DIARIO-APRENDIZAJE.md`](docs/DIARIO-APRENDIZAJE.md).

## Stack

Tauri v2 · React · TypeScript · Vite · CSS a medida · SQLite (SQLCipher) · transformers.js · Ollama (LLM local opcional)

---

© Zalent. Proyecto original (clean-room). No afiliado a proyectos anteriores.
