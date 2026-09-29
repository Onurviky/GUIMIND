import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Configuración del vault, desde variables de entorno o el archivo `.env`
 * de la raíz del proyecto (ver `.env.example`):
 *
 *   VAULT_DIR      carpeta del vault (obligatoria)
 *   VAULT_INCLUDE  qué leer del vault, separado por comas (default: todo)
 *   PUBLISH_ALL    "true" publica todas las notas sin exigir `publish: true`
 */
export interface VaultConfig {
  dir: string;
  include: string[];
  publishAll: boolean;
}

export function vaultConfig(root: string): VaultConfig {
  const envFile = resolve(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const dir = process.env.VAULT_DIR?.trim();
  if (!dir) {
    throw new Error("Falta VAULT_DIR: copiá .env.example como .env y poné la carpeta del vault de Obsidian.");
  }
  if (!existsSync(dir)) {
    throw new Error(`No se encuentra el vault en "${dir}" (VAULT_DIR). ¿Está conectado el disco?`);
  }

  return {
    dir: resolve(root, dir),
    include: (process.env.VAULT_INCLUDE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    publishAll: process.env.PUBLISH_ALL?.trim().toLowerCase() === "true",
  };
}
