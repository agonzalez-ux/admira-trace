import path from "path";

/**
 * Carpeta donde se guardan las fotos de evidencia.
 *
 * En local es `public/uploads` (cómodo para desarrollo). En producción debe
 * apuntar a un volumen persistente montado en el hosting (p. ej. /data/uploads),
 * porque el disco del contenedor se borra en cada despliegue.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "public", "uploads");
