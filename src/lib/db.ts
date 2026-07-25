import Database from "@tauri-apps/plugin-sql";

// Conexión única (cacheada) a la base de datos local de Zalent.
// La primera vez que se carga, el plugin aplica las migraciones definidas en
// Rust (src-tauri/src/lib.rs), es decir: crea las tablas si no existen.
//
// NOTA (footgun conocido): la app de dev y la instalada comparten carpeta de
// datos (mismo identificador), así que comparten esta MISMA `zalent.db`. Se
// probó separarlas (un `zalent-dev.db` solo para dev), pero (a) las migraciones
// están registradas para "sqlite:zalent.db", así que el fichero de dev quedaba
// SIN tablas, y (b) el usuario prefiere que ambas apps vean sus datos. La
// mitigación del choque de migraciones (una migración probada en dev deja la BD
// en una versión que la app instalada vieja no abre) NO es separar la BD, sino:
// evitar migraciones para cambios cosméticos, y RECONSTRUIR el instalador
// cuando el esquema cambie. Ver Diario 61.
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:zalent.db");
  }
  return dbPromise;
}
