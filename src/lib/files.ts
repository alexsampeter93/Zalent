import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

// Guarda una copia del archivo original del CV en el equipo y devuelve su ruta.
export async function saveCvFile(file: File): Promise<string> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const safe = file.name.replace(/[^\w.\- ]+/g, "_");
  const fileName = `${Date.now()}-${safe}`;
  return invoke<string>("save_cv", { fileName, data: bytes });
}

// Abre el CV con la aplicación por defecto del sistema. Si está cifrado, el
// backend lo descifra a una copia temporal y devolvemos esa ruta para abrirla.
export async function openCvFile(path: string): Promise<void> {
  const openable = await invoke<string>("read_cv_temp", { path });
  await openPath(openable);
}

// Borra el archivo del CV (RGPD: borrado real al eliminar el candidato).
export async function deleteCvFile(path: string): Promise<void> {
  await invoke("delete_cv", { path });
}
