import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

// Ruta de la carpeta de datos de la app (donde viven la BD y los CVs).
export async function dataDirPath(): Promise<string> {
  return invoke<string>("data_dir");
}

// Tamaño total en disco de esa carpeta (bytes).
export async function dataDirSize(): Promise<number> {
  return invoke<number>("data_dir_size");
}

// Abre la carpeta de datos en el explorador del sistema.
export async function openDataDir(): Promise<void> {
  await openPath(await dataDirPath());
}

// Formatea bytes a algo legible (KB/MB…).
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}
