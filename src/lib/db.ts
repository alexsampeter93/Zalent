import Database from "@tauri-apps/plugin-sql";

// Conexión única (cacheada) a la base de datos local de Zalent.
// La primera vez que se carga, el plugin aplica las migraciones definidas en
// Rust (src-tauri/src/lib.rs), es decir: crea las tablas si no existen.
let dbPromise: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:zalent.db");
  }
  return dbPromise;
}
