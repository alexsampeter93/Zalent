// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use tauri::{Emitter, Manager, State};
use tauri_plugin_sql_cipher::{Migration, MigrationKind};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

// El PID del sidecar de Ollama. Guardamos solo el número de proceso, no el
// `CommandChild` — verificado que `child.kill()` puede COLGARSE (esperamos
// >30s sin que muriera) mientras que matar por PID con `taskkill /T` es
// instantáneo y además mata también a los hijos que Ollama lanza por su
// cuenta (`llama-server.exe`, el motor real). Ver Diario, entrada 30.
struct OllamaSidecar(Mutex<Option<u32>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Clave de cifrado en memoria durante la sesión (nunca en disco). Se rellena
// al desbloquear con la contraseña maestra; None = sin cifrado activo.
#[derive(Default)]
struct KeyState {
    key: Mutex<Option<[u8; 32]>>,
}

// Cabecera que marca un archivo como cifrado por Zalent.
const MAGIC: &[u8; 5] = b"ZENC1";

fn is_encrypted(data: &[u8]) -> bool {
    data.len() >= 5 && &data[0..5] == MAGIC
}

fn encrypt_bytes(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    getrandom::getrandom(&mut nonce).map_err(|e| e.to_string())?;
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), data)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(5 + 12 + ct.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt_bytes(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if !is_encrypted(data) || data.len() < 17 {
        return Err("archivo no cifrado o corrupto".into());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(&data[5..17]), &data[17..])
        .map_err(|e| e.to_string())
}

// Deriva la clave de cifrado (32 bytes) desde la contraseña y una sal DISTINTA
// a la del hash de verificación (para no reutilizar sal ni exponer la clave).
fn derive_key(password: &str, enc_salt_b64: &str) -> Result<[u8; 32], String> {
    let salt = SaltString::from_b64(enc_salt_b64).map_err(|e| e.to_string())?;
    let mut salt_bytes = [0u8; 32];
    let sb = salt.decode_b64(&mut salt_bytes).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), sb, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn cvs_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cvs"))
}

// Guarda una copia del CV en la carpeta de datos (local). Si la app está
// desbloqueada con contraseña, el archivo se guarda CIFRADO.
#[tauri::command]
fn save_cv(
    app: tauri::AppHandle,
    state: State<KeyState>,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let dir = cvs_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&file_name);
    let bytes = match state.key.lock().unwrap().as_ref() {
        Some(key) => encrypt_bytes(key, &data)?,
        None => data,
    };
    fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// Borra el archivo del CV (borrado real, RGPD). No falla si ya no existe.
#[tauri::command]
fn delete_cv(path: String) -> Result<(), String> {
    let _ = fs::remove_file(&path);
    Ok(())
}

// Ruta de la carpeta de datos (para abrirla / mostrarla).
#[tauri::command]
fn data_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string())
}

fn dir_size(path: &std::path::Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}

// Tamaño total en disco de la carpeta de datos (bytes).
#[tauri::command]
fn data_dir_size(app: tauri::AppHandle) -> Result<u64, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir_size(&dir))
}

// Devuelve una ruta ABIERTA por el SO: si el archivo está cifrado, lo descifra
// a una copia temporal y devuelve esa; si no, devuelve la ruta original.
#[tauri::command]
fn read_cv_temp(state: State<KeyState>, path: String) -> Result<String, String> {
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    if !is_encrypted(&data) {
        return Ok(path);
    }
    let guard = state.key.lock().unwrap();
    let key = guard.as_ref().ok_or("app bloqueada")?;
    let plain = decrypt_bytes(key, &data)?;
    let name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "cv".into());
    let tmpdir = std::env::temp_dir().join("zalent_view");
    fs::create_dir_all(&tmpdir).map_err(|e| e.to_string())?;
    let tmp = tmpdir.join(name);
    fs::write(&tmp, &plain).map_err(|e| e.to_string())?;
    Ok(tmp.to_string_lossy().to_string())
}

// ----- Contraseña maestra + cifrado -----
// `vault.json` (v2) = JSON { hash, enc_salt }. La contraseña NO se guarda; solo
// el hash Argon2 (verificación) y una sal para derivar la clave. Sin recuperación.
#[derive(Serialize, Deserialize)]
struct Vault {
    hash: String,
    #[serde(default)]
    enc_salt: String,
}

fn vault_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault.json"))
}

fn read_vault(app: &tauri::AppHandle) -> Result<Option<Vault>, String> {
    let p = vault_path(app)?;
    if !p.exists() {
        return Ok(None);
    }
    let s = fs::read_to_string(&p).map_err(|e| e.to_string())?;
    if s.trim().is_empty() {
        return Ok(None);
    }
    // v2 = JSON; legacy = solo el hash como texto plano.
    match serde_json::from_str::<Vault>(&s) {
        Ok(v) => Ok(Some(v)),
        Err(_) => Ok(Some(Vault {
            hash: s.trim().to_string(),
            enc_salt: String::new(),
        })),
    }
}

fn verify_pw(vault: &Vault, password: &str) -> bool {
    match PasswordHash::new(vault.hash.trim()) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
fn has_master_password(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(read_vault(&app)?.is_some())
}

#[tauri::command]
fn set_master_password(
    app: tauri::AppHandle,
    state: State<KeyState>,
    password: String,
) -> Result<(), String> {
    // Sal del HASH de verificación.
    let mut hsalt = [0u8; 16];
    getrandom::getrandom(&mut hsalt).map_err(|e| e.to_string())?;
    let hsalt = SaltString::encode_b64(&hsalt).map_err(|e| e.to_string())?;
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &hsalt)
        .map_err(|e| e.to_string())?
        .to_string();
    // Sal DISTINTA para la clave de cifrado.
    let mut esalt = [0u8; 16];
    getrandom::getrandom(&mut esalt).map_err(|e| e.to_string())?;
    let enc_salt = SaltString::encode_b64(&esalt)
        .map_err(|e| e.to_string())?
        .to_string();
    let vault = Vault {
        hash,
        enc_salt: enc_salt.clone(),
    };
    fs::write(
        vault_path(&app)?,
        serde_json::to_string(&vault).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    // Dejamos la clave lista en memoria para poder cifrar ya.
    *state.key.lock().unwrap() = Some(derive_key(&password, &enc_salt)?);
    Ok(())
}

// Desbloqueo: verifica y, si hay sal de cifrado, deja la clave en memoria.
#[tauri::command]
fn unlock(app: tauri::AppHandle, state: State<KeyState>, password: String) -> Result<bool, String> {
    let vault = match read_vault(&app)? {
        Some(v) => v,
        None => return Ok(false),
    };
    if !verify_pw(&vault, &password) {
        return Ok(false);
    }
    if !vault.enc_salt.is_empty() {
        *state.key.lock().unwrap() = Some(derive_key(&password, &vault.enc_salt)?);
    }
    Ok(true)
}

// Descifra TODOS los CVs (para poder quitar la contraseña sin perderlos).
fn decrypt_all_cvs(app: &tauri::AppHandle, key: &[u8; 32]) -> Result<usize, String> {
    let dir = cvs_dir(app)?;
    if !dir.exists() {
        return Ok(0);
    }
    let mut count = 0usize;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let data = fs::read(&path).map_err(|e| e.to_string())?;
        if !is_encrypted(&data) {
            continue;
        }
        let plain = decrypt_bytes(key, &data)?;
        let tmp = path.with_extension("tmp_dec");
        fs::write(&tmp, &plain).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

// Quita la contraseña (tras verificar). Si hay archivos cifrados, los DESCIFRA
// antes (para no dejarlos inaccesibles). Devuelve false si la contraseña falla.
#[tauri::command]
fn remove_master_password(
    app: tauri::AppHandle,
    state: State<KeyState>,
    password: String,
) -> Result<bool, String> {
    let vault = match read_vault(&app)? {
        Some(v) => v,
        None => return Ok(true),
    };
    if !verify_pw(&vault, &password) {
        return Ok(false);
    }
    if !vault.enc_salt.is_empty() {
        let key = derive_key(&password, &vault.enc_salt)?;
        decrypt_all_cvs(&app, &key)?;
    }
    let _ = fs::remove_file(vault_path(&app)?);
    *state.key.lock().unwrap() = None;
    Ok(true)
}

// Autotest del motor de cifrado: cifra y descifra una muestra en memoria.
// Sirve para comprobar que todo funciona ANTES de tocar archivos reales.
#[tauri::command]
fn crypto_selftest(state: State<KeyState>) -> Result<bool, String> {
    let guard = state.key.lock().unwrap();
    let key = guard.as_ref().ok_or("no hay clave (desbloquea la app)")?;
    let sample = b"zalent-selftest-0123456789";
    let enc = encrypt_bytes(key, sample)?;
    Ok(decrypt_bytes(key, &enc)? == sample)
}

// Cifra todos los CVs que aún estén en claro. SEGURO: cifra, verifica que se
// descifra idéntico, y solo entonces reemplaza (si falla, no toca el original).
#[tauri::command]
fn encrypt_all_cvs(app: tauri::AppHandle, state: State<KeyState>) -> Result<usize, String> {
    let guard = state.key.lock().unwrap();
    let key = guard.as_ref().ok_or("no hay clave (desbloquea la app)")?;
    let dir = cvs_dir(&app)?;
    if !dir.exists() {
        return Ok(0);
    }
    let mut count = 0usize;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let data = fs::read(&path).map_err(|e| e.to_string())?;
        if is_encrypted(&data) {
            continue;
        }
        let enc = encrypt_bytes(key, &data)?;
        // Verificación de ida y vuelta ANTES de reemplazar.
        if decrypt_bytes(key, &enc)? != data {
            return Err(format!("verificación fallida en {}", path.display()));
        }
        let tmp = path.with_extension("tmp_enc");
        fs::write(&tmp, &enc).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

// ============================================================================
// SPIKE (temporal): hablar con Ollama, que corre NATIVO fuera de Zalent.
//
// Por qué desde Rust y no con fetch() desde la interfaz:
//   1. CORS. En producción el webview tiene origen `tauri://localhost`, que
//      Ollama rechazaría. Desde Rust no hay navegador, así que no hay CORS.
//   2. Arquitectura: el lado nativo es el ADAPTADOR al mundo exterior. La
//      interfaz no debería saber que Ollama existe (principio hexagonal).
//
// Objetivo del spike: responder si un modelo BUENO (7B) extrae la ficha bien
// en español. La velocidad aquí no decide: sabemos que irá lento por CPU.
// ============================================================================

// Puerto PROPIO, distinto del 11434 por defecto de Ollama: así el sidecar de
// Zalent nunca choca con una instalación de Ollama que el usuario ya tuviera
// para otra cosa. Es "el Ollama de Zalent", no "el Ollama del sistema".
const OLLAMA_URL: &str = "http://127.0.0.1:11435";
const OLLAMA_HOST: &str = "127.0.0.1:11435";

#[derive(Serialize)]
pub struct OllamaStatus {
    running: bool,
    models: Vec<String>,
    error: String,
}

// ¿Está Ollama levantado y con qué modelos? Sin esto, cualquier fallo
// posterior parecería un bug nuestro cuando en realidad es que no arrancó.
#[tauri::command]
async fn ollama_status() -> OllamaStatus {
    let client = reqwest::Client::new();
    match client.get(format!("{OLLAMA_URL}/api/tags")).send().await {
        Ok(resp) => match resp.json::<serde_json::Value>().await {
            Ok(v) => {
                let models = v["models"]
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|m| m["name"].as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                OllamaStatus { running: true, models, error: String::new() }
            }
            Err(e) => OllamaStatus {
                running: true,
                models: vec![],
                error: format!("respuesta ilegible: {e}"),
            },
        },
        Err(e) => OllamaStatus {
            running: false,
            models: vec![],
            error: format!("no responde en {OLLAMA_URL}: {e}"),
        },
    }
}

#[derive(Serialize)]
pub struct OllamaExtractResult {
    raw: String,
    ms: u64,
    error: String,
}

// Progreso de la descarga del modelo, que se emite a la interfaz mientras baja.
#[derive(Serialize, Clone)]
pub struct PullProgress {
    status: String,
    completed: u64,
    total: u64,
    done: bool,
    error: String,
}

// Descarga el modelo (~4,7 GB) la primera vez. Ollama devuelve el progreso
// como un flujo de líneas JSON, así que las leemos según llegan y las
// reemitimos a la interfaz — si esperáramos al final, el usuario vería la
// app congelada varios minutos sin saber si funciona.
#[tauri::command]
async fn ollama_pull(app: tauri::AppHandle, model: String) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(7200)) // 4,7 GB pueden tardar
        .build()
        .map_err(|e| e.to_string())?;

    let mut resp = client
        .post(format!("{OLLAMA_URL}/api/pull"))
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("no se pudo iniciar la descarga: {e}"))?;

    let mut buf = String::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        buf.push_str(&String::from_utf8_lossy(&chunk));
        // El flujo puede cortar una línea por la mitad: procesamos solo las
        // líneas COMPLETAS y dejamos el resto en el buffer para la siguiente.
        while let Some(nl) = buf.find('\n') {
            let line: String = buf.drain(..=nl).collect();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(err) = v["error"].as_str() {
                    let _ = app.emit(
                        "ollama-pull",
                        PullProgress {
                            status: String::new(),
                            completed: 0,
                            total: 0,
                            done: true,
                            error: err.to_string(),
                        },
                    );
                    return Err(err.to_string());
                }
                let status = v["status"].as_str().unwrap_or("").to_string();
                let done = status == "success";
                let _ = app.emit(
                    "ollama-pull",
                    PullProgress {
                        status,
                        completed: v["completed"].as_u64().unwrap_or(0),
                        total: v["total"].as_u64().unwrap_or(0),
                        done,
                        error: String::new(),
                    },
                );
            }
        }
    }
    Ok(())
}

// El ESQUEMA. Ollama acepta un JSON Schema en `format` y OBLIGA al modelo a
// cumplirlo: ya no puede devolver `fullName` en vez de `full_name`, ni
// saltarse campos, ni envolverlo en ```json. El formato deja de ser un ruego
// y pasa a ser una garantía. (Con transformers.js no teníamos esto.)
//
// OJO: `years_experience` NO está aquí a propósito (Diario, entrada 29.4).
// Es el único campo que exige CALCULAR (sumar periodos), no copiar, y ahí el
// modelo osciló entre ejecuciones idénticas. Ese cálculo ya lo hace
// `detectYears()` en TypeScript, determinista y gratis — no tiene sentido
// pedirle a un LLM que adivine una suma que el código ya hace bien.
fn extraction_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "full_name":     { "type": ["string", "null"] },
            "location":      { "type": ["string", "null"] },
            "last_position": { "type": ["string", "null"] },
            "education":     { "type": ["string", "null"] },
            "skills":        { "type": "array", "items": { "type": "string" } },
            "languages":     { "type": "array", "items": { "type": "string" } }
        },
        "required": ["full_name", "location", "last_position", "education", "skills", "languages"]
    })
}

#[tauri::command]
async fn ollama_extract(model: String, cv_text: String) -> OllamaExtractResult {
    let prompt = format!(
        "Extrae los datos de este CV.\n\n\
         REGLAS:\n\
         - Si un dato NO aparece en el CV, pon null. No lo inventes ni lo deduzcas.\n\
         - Copia literalmente lo que pone el CV.\n\n\
         CV:\n{}",
        // Recortamos: el contexto cuesta tiempo y los CVs largos no aportan más.
        cv_text.chars().take(6000).collect::<String>()
    );

    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": "Eres un extractor de datos de CVs. No inventas nada." },
            { "role": "user", "content": prompt }
        ],
        "format": extraction_schema(),
        "stream": false,
        "options": { "temperature": 0 } // sin azar: mismo CV → misma ficha
    });

    let client = reqwest::Client::builder()
        // Un 7B por CPU es lento; el timeout por defecto lo cortaría a medias
        // y parecería un fallo cuando solo estaba pensando.
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap();

    let started = std::time::Instant::now();
    let resp = client
        .post(format!("{OLLAMA_URL}/api/chat"))
        .json(&body)
        .send()
        .await;
    let ms = started.elapsed().as_millis() as u64;

    match resp {
        Ok(r) => match r.json::<serde_json::Value>().await {
            Ok(v) => {
                if let Some(err) = v["error"].as_str() {
                    return OllamaExtractResult { raw: String::new(), ms, error: err.to_string() };
                }
                OllamaExtractResult {
                    raw: v["message"]["content"].as_str().unwrap_or("").to_string(),
                    ms,
                    error: String::new(),
                }
            }
            Err(e) => OllamaExtractResult { raw: String::new(), ms, error: e.to_string() },
        },
        Err(e) => OllamaExtractResult { raw: String::new(), ms, error: e.to_string() },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Migraciones: definen y versionan el esquema de la base de datos.
    // Cada migración se aplica UNA sola vez y en orden de versión, así que el
    // esquema evoluciona de forma controlada sin perder datos existentes.
    let migrations = vec![Migration {
        version: 1,
        description: "create_initial_schema",
        sql: "
            CREATE TABLE candidates (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name        TEXT,
                email            TEXT,
                phone            TEXT,
                location         TEXT,
                headline         TEXT,
                years_experience REAL,
                education        TEXT,
                links            TEXT,
                raw_text         TEXT,
                source_file      TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE skills (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                name         TEXT NOT NULL,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            );

            CREATE TABLE languages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                name         TEXT NOT NULL,
                level        TEXT,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_skills_candidate    ON skills(candidate_id);
            CREATE INDEX idx_languages_candidate ON languages(candidate_id);
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "create_notes",
        sql: "
            CREATE TABLE notes (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                body         TEXT NOT NULL,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_notes_candidate ON notes(candidate_id);
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 3,
        description: "create_candidate_vectors",
        sql: "
            CREATE TABLE candidate_vectors (
                candidate_id INTEGER PRIMARY KEY,
                model        TEXT NOT NULL,
                vector       TEXT NOT NULL,
                updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            );
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 4,
        description: "create_candidate_chunks",
        sql: "
            CREATE TABLE candidate_chunks (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                idx          INTEGER NOT NULL,
                text         TEXT NOT NULL,
                model        TEXT NOT NULL,
                vector       TEXT NOT NULL,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_chunks_candidate ON candidate_chunks(candidate_id);
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 5,
        description: "add_candidate_file_path",
        sql: "ALTER TABLE candidates ADD COLUMN file_path TEXT;",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 6,
        description: "add_candidate_status",
        sql: "ALTER TABLE candidates ADD COLUMN status TEXT NOT NULL DEFAULT 'nuevo';",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 7,
        description: "vacancies_and_membership",
        sql: "
            CREATE TABLE vacancies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'abierta',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE candidate_vacancy (
                candidate_id INTEGER NOT NULL,
                vacancy_id INTEGER NOT NULL,
                stage TEXT NOT NULL DEFAULT 'nuevo',
                added_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (candidate_id, vacancy_id)
            );
            CREATE INDEX idx_cv_vacancy ON candidate_vacancy(vacancy_id);
            CREATE INDEX idx_cv_candidate ON candidate_vacancy(candidate_id);
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 8,
        description: "candidate_tags",
        sql: "
            CREATE TABLE candidate_tags (
                candidate_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (candidate_id, tag)
            );
            CREATE INDEX idx_tags_tag ON candidate_tags(tag);
        ",
        kind: MigrationKind::Up,
    },
    Migration {
        version: 9,
        description: "feedback",
        sql: "
            CREATE TABLE feedback (
                candidate_id INTEGER PRIMARY KEY,
                vote INTEGER NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        ",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .manage(KeyState::default())
        .manage(OllamaSidecar(Mutex::new(None)))
        .setup(|app| {
            // Al arrancar, borramos las copias temporales EN CLARO que se
            // generan al ver un CV cifrado (que no queden en el disco).
            let tmp = std::env::temp_dir().join("zalent_view");
            let _ = fs::remove_dir_all(&tmp);

            // El modelo NO viaja en el instalador: se descarga la primera vez
            // que el usuario enciende la IA (~4,7 GB). Motivo: ni MSI ni NSIS
            // admiten ficheros de más de 2 GB, y el CAB de un MSI tiene un
            // techo total de 2 GB — el modelo bueno (7B) pesa 4,68 GB en un
            // solo blob. Es también lo que hacen LM Studio, GPT4All y el
            // propio Ollama. Ver Diario, entrada 33.
            //
            // Va en la carpeta de datos de la app (escribible), NO en los
            // recursos junto al .exe: eso vive en Archivos de programa, que
            // es de solo lectura para un usuario normal — ahí no se podría
            // descargar nada. Sigue estando aislado del ~/.ollama del sistema.
            let models_dir = app.path().app_data_dir().ok().map(|d| d.join("models"));
            if let Some(p) = &models_dir {
                let _ = fs::create_dir_all(p);
                eprintln!("[zalent] modelos en: {}", p.display());
            }

            // Arrancamos Ollama como sidecar: viaja EMPOTRADO en el propio
            // instalador de Zalent (ver src-tauri/binaries/), así que el
            // usuario nunca instala nada aparte ni abre una terminal. Si
            // falla el arranque no rompemos la app: la IA queda "no
            // disponible" y el resto de Zalent sigue funcionando (principio
            // "la IA mejora el producto, no es el producto").
            match app.shell().sidecar("ollama") {
                Ok(cmd) => {
                    let mut cmd = cmd
                        .arg("serve")
                        .env("OLLAMA_HOST", OLLAMA_HOST)
                        // Ollama trae funciones de NUBE activadas por defecto: los
                        // modelos con sufijo `-cloud` se ejecutan en sus servidores.
                        // Nosotros solo pedimos modelos locales, así que hoy no hay
                        // fuga — pero la promesa de Zalent ("nada sale de tu equipo")
                        // no puede depender de que no los pidamos. Aquí se apaga la
                        // nube de raíz: aunque alguien pidiera un modelo `-cloud`,
                        // no habría a dónde enviarlo. Mismo principio que el
                        // validador de anclaje: no te fíes, impídelo.
                        .env("OLLAMA_NO_CLOUD", "1");
                    if let Some(p) = &models_dir {
                        cmd = cmd.env("OLLAMA_MODELS", p.to_string_lossy().to_string());
                    }
                    match cmd.spawn() {
                    Ok((_rx, child)) => {
                        app.state::<OllamaSidecar>().0.lock().unwrap().replace(child.pid());
                    }
                    Err(e) => eprintln!("No se pudo arrancar el sidecar de Ollama: {e}"),
                }},
                Err(e) => eprintln!("No se pudo resolver el sidecar de Ollama: {e}"),
            }
            Ok(())
        })
        .plugin(
            tauri_plugin_sql_cipher::Builder::default()
                .add_migrations("sqlite:zalent.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_cv,
            delete_cv,
            read_cv_temp,
            data_dir,
            data_dir_size,
            has_master_password,
            set_master_password,
            unlock,
            remove_master_password,
            crypto_selftest,
            encrypt_all_cvs,
            ollama_status,
            ollama_extract,
            ollama_pull
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Al cerrar Zalent, matamos el sidecar. Sin esto, Ollama se
            // quedaría corriendo de fondo indefinidamente como un proceso
            // zombi cada vez que el usuario cierra la app.
            if let tauri::RunEvent::Exit = event {
                if let Some(pid) = app_handle.state::<OllamaSidecar>().0.lock().unwrap().take() {
                    // `/T` mata el proceso Y TODO SU ÁRBOL de un golpe: nos
                    // ahorra tanto el cuelgue de `child.kill()` como tener que
                    // cazar `llama-server.exe` por separado (Diario, 30.5).
                    #[cfg(target_os = "windows")]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/PID", &pid.to_string(), "/T"])
                            .creation_flags(0x08000000) // CREATE_NO_WINDOW: sin parpadeo de consola al cerrar
                            .output();
                    }
                }
            }
        });
}
