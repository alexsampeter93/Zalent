import { invoke } from "@tauri-apps/api/core";

// Contraseña maestra + cifrado. El backend guarda solo un hash Argon2 (con sal)
// y una sal para derivar la clave; la contraseña nunca se almacena.

export async function hasMasterPassword(): Promise<boolean> {
  return invoke<boolean>("has_master_password");
}

// Fija la contraseña (y deja la clave lista en memoria para cifrar).
export async function setMasterPassword(password: string): Promise<void> {
  await invoke("set_master_password", { password });
}

// Desbloquea: verifica y deja la clave de cifrado en memoria. true si es correcta.
export async function unlock(password: string): Promise<boolean> {
  return invoke<boolean>("unlock", { password });
}

// Quita la contraseña (descifra los archivos antes). false si no coincide.
export async function removeMasterPassword(password: string): Promise<boolean> {
  return invoke<boolean>("remove_master_password", { password });
}

// Autotest del motor de cifrado (sin tocar archivos). true = OK.
export async function cryptoSelftest(): Promise<boolean> {
  return invoke<boolean>("crypto_selftest");
}

// Cifra todos los CVs que aún estén en claro. Devuelve cuántos cifró.
export async function encryptAllCvs(): Promise<number> {
  return invoke<number>("encrypt_all_cvs");
}

// ---- Cifrado de la BASE DE DATOS (SQLCipher) ----

export interface DbEncryptionStatus {
  encrypted: boolean;
  // Copias SIN CIFRAR que dejó la migración (rutas completas). Mientras
  // existan, hay datos personales en claro en el disco.
  backups: string[];
  backup_bytes: number;
}

export async function dbEncryptionStatus(): Promise<DbEncryptionStatus> {
  return invoke<DbEncryptionStatus>("db_encryption_status");
}

// Cifra la BD entera. Hace copia de seguridad, cifra a un fichero nuevo,
// VERIFICA que no se ha perdido nada y solo entonces reemplaza. Devuelve un
// resumen. Puede tardar unos segundos según el tamaño de la base.
export async function encryptDatabase(): Promise<string> {
  return invoke<string>("encrypt_database");
}

// Borra las copias sin cifrar. Solo se permite si la BD ya está cifrada.
export async function deletePlaintextBackups(): Promise<number> {
  return invoke<number>("delete_plaintext_backups");
}
