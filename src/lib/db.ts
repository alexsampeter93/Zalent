import Database from "@tauri-apps/plugin-sql";

// Conexión única (cacheada) a la base de datos local de Zalent.
// La primera vez que se carga, el plugin aplica las migraciones definidas en
// Rust (src-tauri/src/lib.rs), es decir: crea las tablas si no existen.
//
// En DESARROLLO usa un fichero DISTINTO (`zalent-dev.db`). Motivo: la app de dev
// y la instalada comparten carpeta de datos (mismo identificador), así que si
// ambas usaran el mismo fichero, una migración nueva probada en dev "sube" el
// esquema de la BD y la app instalada (más antigua) ya no puede abrirla
// ("migration N previously applied but missing"). Con ficheros separados,
// probar en dev nunca toca tus datos de verdad. `import.meta.env.DEV` lo da
// Vite: true al servir en desarrollo, false en el build instalado. Ver B / Diario 61.
let dbPromise: Promise<Database> | null = null;

const DB_FILE = import.meta.env.DEV ? "sqlite:zalent-dev.db" : "sqlite:zalent.db";

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load(DB_FILE);
  }
  return dbPromise;
}
