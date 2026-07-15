import { invoke } from "@tauri-apps/api/core";

// Contraseña maestra (bloqueo de la app). El backend solo guarda un hash
// Argon2 con sal; la contraseña nunca se almacena. No hay recuperación.

export async function hasMasterPassword(): Promise<boolean> {
  return invoke<boolean>("has_master_password");
}

export async function setMasterPassword(password: string): Promise<void> {
  await invoke("set_master_password", { password });
}

// Devuelve true si la contraseña es correcta.
export async function verifyMasterPassword(password: string): Promise<boolean> {
  return invoke<boolean>("verify_master_password", { password });
}

// Quita la contraseña tras verificarla. Devuelve false si no coincide.
export async function removeMasterPassword(password: string): Promise<boolean> {
  return invoke<boolean>("remove_master_password", { password });
}
