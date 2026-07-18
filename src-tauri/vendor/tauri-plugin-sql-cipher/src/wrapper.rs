// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT
//
// FORK de Zalent, solo SQLite (se quitó mysql/postgres, que Zalent no usa).
// El único cambio de comportamiento real frente al original: connect() abre
// con SqliteConnectOptions en vez de la URL simple, para poder pasarle la
// clave de cifrado (PRAGMA key) más adelante. Por ahora, SIN clave: debe
// comportarse exactamente igual que el plugin oficial. Ver Diario, entrada 39.

use std::fs::create_dir_all;
use std::str::FromStr;

use indexmap::IndexMap;
use serde_json::Value as JsonValue;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{migrate::MigrateDatabase, Column, Executor, Pool, Row, Sqlite};
use tauri::Manager;
use tauri::{AppHandle, Runtime};

use crate::LastInsertId;

pub enum DbPool {
    Sqlite(Pool<Sqlite>),
}

// private methods
impl DbPool {
    pub(crate) async fn connect<R: Runtime>(
        conn_url: &str,
        _app: &AppHandle<R>,
    ) -> Result<Self, crate::Error> {
        let app_path = _app
            .path()
            .app_config_dir()
            .expect("No App config path was found!");

        create_dir_all(&app_path).expect("Couldn't create app config dir");

        let conn_url = &path_mapper(app_path, conn_url);

        if !Sqlite::database_exists(conn_url).await.unwrap_or(false) {
            Sqlite::create_database(conn_url).await?;
        }

        // TODO(cifrado): cuando se active la clave real, añadir aquí
        // `.pragma("key", format!("\"x'{hex}'\""))` ANTES de create_if_missing
        // -- ver la investigación de la Entrada 39 sobre por qué debe ir en
        // hexadecimal (sqlx no escapa el valor del pragma).
        let opts = SqliteConnectOptions::from_str(conn_url)
            .map_err(sqlx::Error::from)?
            .create_if_missing(true);
        Ok(Self::Sqlite(SqlitePoolOptions::new().connect_with(opts).await?))
    }

    pub(crate) async fn migrate(&self, _migrator: &sqlx::migrate::Migrator) -> Result<(), crate::Error> {
        match self {
            DbPool::Sqlite(pool) => _migrator.run(pool).await?,
        }
        Ok(())
    }

    pub(crate) async fn close(&self) {
        match self {
            DbPool::Sqlite(pool) => pool.close().await,
        }
    }

    pub(crate) async fn execute(
        &self,
        _query: String,
        _values: Vec<JsonValue>,
    ) -> Result<(u64, LastInsertId), crate::Error> {
        Ok(match self {
            DbPool::Sqlite(pool) => {
                let mut query = sqlx::query(&_query);
                for value in _values {
                    if value.is_null() {
                        query = query.bind(None::<JsonValue>);
                    } else if value.is_string() {
                        query = query.bind(value.as_str().unwrap().to_owned())
                    } else if let Some(number) = value.as_number() {
                        query = query.bind(number.as_f64().unwrap_or_default())
                    } else {
                        query = query.bind(value);
                    }
                }
                let result = pool.execute(query).await?;
                (
                    result.rows_affected(),
                    LastInsertId::Sqlite(result.last_insert_rowid()),
                )
            }
        })
    }

    pub(crate) async fn select(
        &self,
        _query: String,
        _values: Vec<JsonValue>,
    ) -> Result<Vec<IndexMap<String, JsonValue>>, crate::Error> {
        Ok(match self {
            DbPool::Sqlite(pool) => {
                let mut query = sqlx::query(&_query);
                for value in _values {
                    if value.is_null() {
                        query = query.bind(None::<JsonValue>);
                    } else if value.is_string() {
                        query = query.bind(value.as_str().unwrap().to_owned())
                    } else if let Some(number) = value.as_number() {
                        query = query.bind(number.as_f64().unwrap_or_default())
                    } else {
                        query = query.bind(value);
                    }
                }
                let rows = pool.fetch_all(query).await?;
                let mut values = Vec::new();
                for row in rows {
                    let mut value = IndexMap::default();
                    for (i, column) in row.columns().iter().enumerate() {
                        let v = row.try_get_raw(i)?;
                        let v = crate::decode::sqlite::to_json(v)?;
                        value.insert(column.name().to_string(), v);
                    }
                    values.push(value);
                }
                values
            }
        })
    }
}

/// Mapea la ruta de conexión que da el usuario a una ruta absoluta dentro de
/// la carpeta de datos de la app.
fn path_mapper(mut app_path: std::path::PathBuf, connection_string: &str) -> String {
    app_path.push(
        connection_string
            .split_once(':')
            .expect("Couldn't parse the connection string for DB!")
            .1,
    );

    format!(
        "sqlite:{}",
        app_path
            .to_str()
            .expect("Problem creating fully qualified path to Database file!")
    )
}
