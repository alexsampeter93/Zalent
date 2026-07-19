import { invoke } from "@tauri-apps/api/core";

// Escrituras ATÓMICAS: varias sentencias que ocurren todas o no ocurre ninguna.
//
// Por qué no se hace con `db.execute("BEGIN")` desde aquí: el plugin SQL abre
// un pool de 10 conexiones y cada `execute` coge una cualquiera, así que el
// BEGIN, los INSERT y el COMMIT acabarían en conexiones distintas. Parecería
// transaccional sin serlo. El detalle está en `db_transaction` (Rust) y en el
// Diario, entrada 46.
//
// Aquí no se abre ni se cierra nada: se describe el bloque entero y se manda de
// una vez. No hay COMMIT que olvidar porque no hay COMMIT que escribir.

// Referencia al id generado por una sentencia ANTERIOR del mismo bloque.
export interface Ref {
  __ref: number;
}

export type Param = string | number | boolean | null | Ref;

// El id que generó la sentencia número `index` (0 = la primera).
export function ref(index: number): Ref {
  return { __ref: index };
}

// Una sentencia: el SQL y sus parámetros.
export type Stmt = [sql: string, params?: Param[]];

// Ejecuta el bloque. Devuelve el id generado por cada sentencia, en orden.
export async function transaction(statements: Stmt[]): Promise<number[]> {
  if (statements.length === 0) return [];
  return invoke<number[]>("db_transaction", {
    statements: statements.map(([sql, params]) => ({ sql, params: params ?? [] })),
  });
}
