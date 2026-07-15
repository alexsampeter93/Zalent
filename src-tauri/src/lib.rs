// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Guarda una copia del CV original en la carpeta de datos de la app (local).
// Devuelve la ruta absoluta, que guardamos en la ficha del candidato.
#[tauri::command]
fn save_cv(app: tauri::AppHandle, file_name: String, data: Vec<u8>) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cvs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&file_name);
    fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

// Borra el archivo del CV (borrado real, RGPD). No falla si ya no existe.
#[tauri::command]
fn delete_cv(path: String) -> Result<(), String> {
    let _ = fs::remove_file(&path);
    Ok(())
}

// ----- Contraseña maestra (bloqueo de la app) -----
// Guardamos SOLO un hash Argon2 (con sal aleatoria) en `vault.json`. La
// contraseña en sí NO se guarda en ningún sitio. No hay recuperación.
fn vault_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("vault.json"))
}

#[tauri::command]
fn has_master_password(app: tauri::AppHandle) -> Result<bool, String> {
    let p = vault_path(&app)?;
    Ok(p.exists()
        && fs::read_to_string(&p)
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false))
}

#[tauri::command]
fn set_master_password(app: tauri::AppHandle, password: String) -> Result<(), String> {
    let mut salt_bytes = [0u8; 16];
    getrandom::getrandom(&mut salt_bytes).map_err(|e| e.to_string())?;
    let salt = SaltString::encode_b64(&salt_bytes).map_err(|e| e.to_string())?;
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| e.to_string())?
        .to_string();
    fs::write(vault_path(&app)?, hash).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn verify_master_password(app: tauri::AppHandle, password: String) -> Result<bool, String> {
    let stored = fs::read_to_string(vault_path(&app)?).map_err(|e| e.to_string())?;
    let parsed = PasswordHash::new(stored.trim()).map_err(|e| e.to_string())?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

// Quita la contraseña (tras verificarla). Devuelve false si no coincide.
#[tauri::command]
fn remove_master_password(app: tauri::AppHandle, password: String) -> Result<bool, String> {
    if !verify_master_password(app.clone(), password)? {
        return Ok(false);
    }
    let _ = fs::remove_file(vault_path(&app)?);
    Ok(true)
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
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:zalent.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            save_cv,
            delete_cv,
            has_master_password,
            set_master_password,
            verify_master_password,
            remove_master_password
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
