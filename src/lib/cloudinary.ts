import { v2 as cloudinary } from "cloudinary";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

export const CLOUDINARY_CONFIGURADO = Boolean(CLOUD_NAME && API_KEY && API_SECRET);

if (CLOUDINARY_CONFIGURADO) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
  });
}

/**
 * Sube una foto de evidencia a Cloudinary y devuelve su URL pública (HTTPS,
 * servida por su CDN). Se usa en producción, donde el servidor no tiene disco
 * persistente para guardar los ficheros localmente.
 */
export async function subirFotoCloudinary(buffer: Buffer, carpeta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `admira-trace/${carpeta}` },
      (error, resultado) => {
        if (error || !resultado) return reject(error || new Error("Subida a Cloudinary sin resultado."));
        resolve(resultado.secure_url);
      }
    );
    stream.end(buffer);
  });
}
