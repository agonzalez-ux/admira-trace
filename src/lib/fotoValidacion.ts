/**
 * Validación compartida para fotos subidas por formulario (evidencia de
 * incidencias, formulario de viabilidad): evita que un archivo enorme o de
 * un tipo inesperado se cuele y llene el disco o rompa cosas más adelante.
 */

export const MAX_FOTO_BYTES = 15 * 1024 * 1024; // 15 MB — de sobra para una foto de móvil
export const MAX_FOTOS_POR_ENVIO = 10;

const TIPOS_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

/** Devuelve un mensaje de error si el archivo no es válido, o `null` si está bien. */
export function validarFoto(file: File): string | null {
  if (file.size <= 0) return "El archivo está vacío.";
  if (file.size > MAX_FOTO_BYTES) {
    return `La foto "${file.name}" pesa demasiado (máximo ${MAX_FOTO_BYTES / 1024 / 1024} MB).`;
  }
  if (file.type && !TIPOS_PERMITIDOS.has(file.type)) {
    return `"${file.name}" no es una imagen válida (tipo recibido: ${file.type}).`;
  }
  return null;
}

/** Valida una lista de fotos: tamaño/tipo de cada una y un tope de cuántas se pueden mandar juntas. */
export function validarFotos(files: File[]): string | null {
  if (files.length > MAX_FOTOS_POR_ENVIO) {
    return `Como mucho se pueden subir ${MAX_FOTOS_POR_ENVIO} fotos a la vez.`;
  }
  for (const file of files) {
    const error = validarFoto(file);
    if (error) return error;
  }
  return null;
}
