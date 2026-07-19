// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

//! Interface con SQLite (vía sqlx), con soporte SQLCipher. Fork de
//! tauri-plugin-sql recortado solo a SQLite -- ver Diario, entrada 39.

#![doc(
    html_logo_url = "https://github.com/tauri-apps/tauri/raw/dev/app-icon.png",
    html_favicon_url = "https://github.com/tauri-apps/tauri/raw/dev/app-icon.png"
)]

mod commands;
mod decode;
mod error;
mod wrapper;

pub use error::Error;
pub use wrapper::DbPool;

use futures_core::future::BoxFuture;
use serde::{Deserialize, Serialize};
use sqlx::{
    error::BoxDynError,
    migrate::{Migration as SqlxMigration, MigrationSource, MigrationType, Migrator},
};
use tauri::{
    plugin::{Builder as PluginBuilder, TauriPlugin},
    Manager, RunEvent, Runtime,
};
use tokio::sync::{Mutex, RwLock};

use std::collections::HashMap;

#[derive(Default)]
pub struct DbInstances(pub RwLock<HashMap<String, DbPool>>);

/// La clave de cifrado de SQLCipher, si la app quiere una BD cifrada.
///
/// El plugin NO sabe de contraseñas ni de Argon2: solo pregunta "¿hay clave?"
/// justo al abrir la conexión. Es la app (Zalent) quien la deriva de la
/// contraseña maestra y la deja aquí con `app.manage(...)` al desbloquear.
///
/// Si nadie registra este estado, o la clave es `None`, la BD se abre SIN
/// cifrar — exactamente igual que el plugin oficial.
#[derive(Default)]
pub struct DbEncryptionKey(pub std::sync::Mutex<Option<[u8; 32]>>);

impl DbEncryptionKey {
    /// La clave en el formato que espera SQLCipher: bytes crudos en
    /// hexadecimal (`x'...'`), NO una passphrase de texto.
    ///
    /// Importante: sqlx interpola el valor del pragma en el SQL **sin
    /// escaparlo** (comprobado leyendo su código), así que una clave como
    /// texto libre con comillas o guiones rompería la consulta. En hex no
    /// hay caracteres problemáticos. Ver Diario, entrada 39.
    pub(crate) fn pragma_value(&self) -> Option<String> {
        let guard = self.0.lock().ok()?;
        let key = guard.as_ref()?;
        let hex: String = key.iter().map(|b| format!("{b:02x}")).collect();
        Some(format!("\"x'{hex}'\""))
    }
}

/// Cierra todas las conexiones abiertas a la BD.
///
/// Hace falta antes de REEMPLAZAR el fichero de la base de datos en disco
/// (la migración a cifrado): en Windows no se puede sobrescribir un fichero
/// que sigue abierto — daría "acceso denegado". Tras llamar a esto hay que
/// volver a abrirlas con [`reload_pools`], o la app se queda sin BD.
pub async fn close_all_pools<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(instances) = app.try_state::<DbInstances>() {
        let instances = instances.0.read().await;
        for pool in instances.values() {
            pool.close().await;
        }
    }
}

/// Vuelve a abrir las conexiones que cerró [`close_all_pools`], con la
/// configuración actual — incluida la clave de cifrado si se registró
/// mientras tanto.
///
/// Es lo que permite que, tras cifrar la BD, la app siga funcionando SIN
/// reiniciar: un pool cerrado rechaza cualquier consulta, así que sin esto
/// la interfaz se quedaría sin datos hasta el siguiente arranque. No re-aplica
/// las migraciones: ya se aplicaron al cargar la BD por primera vez.
pub async fn reload_pools<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), Error> {
    let Some(instances) = app.try_state::<DbInstances>() else {
        return Ok(());
    };
    // Las URLs de las BD abiertas (p.ej. "sqlite:zalent.db"), copiadas antes
    // de reconectar para no sostener el lock de lectura mientras se abre.
    let urls: Vec<String> = { instances.0.read().await.keys().cloned().collect() };
    for url in urls {
        let pool = DbPool::connect(&url, app).await?;
        instances.0.write().await.insert(url, pool);
    }
    Ok(())
}

/// El pool de SQLite que el plugin YA tiene abierto para `db_url`.
///
/// Existe para que la app pueda hacer consultas nativas (p.ej. calcular
/// vectores en Rust) sin abrir una SEGUNDA conexión al fichero. Eso importa en
/// Windows: una conexión extra impediría reemplazar la BD durante la migración
/// de cifrado, que es justo el problema que resolvió [`close_all_pools`].
///
/// El clon es barato —sqlx comparte el pool por dentro— y no burla el cierre:
/// `close()` actúa sobre ese estado compartido, así que un clon vivo tampoco
/// mantiene el fichero abierto.
pub async fn sqlite_pool<R: Runtime>(
    app: &tauri::AppHandle<R>,
    db_url: &str,
) -> Option<sqlx::SqlitePool> {
    let instances = app.try_state::<DbInstances>()?;
    let instances = instances.0.read().await;
    match instances.get(db_url)? {
        DbPool::Sqlite(pool) => Some(pool.clone()),
    }
}

#[derive(Serialize)]
#[serde(untagged)]
pub(crate) enum LastInsertId {
    Sqlite(i64),
}

struct Migrations(Mutex<HashMap<String, MigrationList>>);

#[derive(Default, Clone, Deserialize)]
pub struct PluginConfig {
    #[serde(default)]
    preload: Vec<String>,
}

#[derive(Debug)]
pub enum MigrationKind {
    Up,
    Down,
}

impl From<MigrationKind> for MigrationType {
    fn from(kind: MigrationKind) -> Self {
        match kind {
            MigrationKind::Up => Self::ReversibleUp,
            MigrationKind::Down => Self::ReversibleDown,
        }
    }
}

/// A migration definition.
#[derive(Debug)]
pub struct Migration {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
    pub kind: MigrationKind,
}

#[derive(Debug)]
struct MigrationList(Vec<Migration>);

impl MigrationSource<'static> for MigrationList {
    fn resolve(self) -> BoxFuture<'static, std::result::Result<Vec<SqlxMigration>, BoxDynError>> {
        Box::pin(async move {
            let mut migrations = Vec::new();
            for migration in self.0 {
                if matches!(migration.kind, MigrationKind::Up) {
                    migrations.push(SqlxMigration::new(
                        migration.version,
                        migration.description.into(),
                        migration.kind.into(),
                        migration.sql.into(),
                        false,
                    ));
                }
            }
            Ok(migrations)
        })
    }
}

/// Allows blocking on async code without creating a nested runtime.
fn run_async_command<F: std::future::Future>(cmd: F) -> F::Output {
    if tokio::runtime::Handle::try_current().is_ok() {
        tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(cmd))
    } else {
        tauri::async_runtime::block_on(cmd)
    }
}

/// Tauri SQL plugin builder.
#[derive(Default)]
pub struct Builder {
    migrations: Option<HashMap<String, MigrationList>>,
}

impl Builder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add migrations to a database.
    #[must_use]
    pub fn add_migrations(mut self, db_url: &str, migrations: Vec<Migration>) -> Self {
        self.migrations
            .get_or_insert(Default::default())
            .insert(db_url.to_string(), MigrationList(migrations));
        self
    }

    pub fn build<R: Runtime>(mut self) -> TauriPlugin<R, Option<PluginConfig>> {
        PluginBuilder::<R, Option<PluginConfig>>::new("sql")
            .invoke_handler(tauri::generate_handler![
                commands::load,
                commands::execute,
                commands::select,
                commands::close
            ])
            .setup(|app, api| {
                let config = api.config().clone().unwrap_or_default();

                run_async_command(async move {
                    let instances = DbInstances::default();
                    let mut lock = instances.0.write().await;

                    for db in config.preload {
                        let pool = DbPool::connect(&db, app).await?;

                        if let Some(migrations) =
                            self.migrations.as_mut().and_then(|mm| mm.remove(&db))
                        {
                            let migrator = Migrator::new(migrations).await?;
                            pool.migrate(&migrator).await?;
                        }

                        lock.insert(db, pool);
                    }
                    drop(lock);

                    app.manage(instances);
                    app.manage(Migrations(Mutex::new(
                        self.migrations.take().unwrap_or_default(),
                    )));

                    Ok(())
                })
            })
            .on_event(|app, event| {
                if let RunEvent::Exit = event {
                    run_async_command(async move {
                        let instances = &*app.state::<DbInstances>();
                        let instances = instances.0.read().await;
                        for value in instances.values() {
                            value.close().await;
                        }
                    });
                }
            })
            .build()
    }
}
