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
