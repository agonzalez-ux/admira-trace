import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { UPLOADS_DIR } from "@/lib/uploads";

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
};

/**
 * Sirve las fotos de evidencia desde la carpeta de subidas (que en producción
 * es un volumen fuera del proyecto, así que Next no puede servirlas como
 * ficheros estáticos).
 *
 * Requiere sesión: son fotos de instalaciones de clientes, no deben quedar
 * accesibles públicamente solo por conocer la URL.
 */
export async function GET(req: NextRequest, { params }: { params: { ruta: string[] } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const relativa = (params.ruta || []).join("/");
  const raiz = path.resolve(UPLOADS_DIR);
  const destino = path.resolve(raiz, relativa);

  // Evita que una ruta con ".." se salga de la carpeta de subidas. Comparar
  // con "raiz + separador" (no solo startsWith(raiz)) evita que una carpeta
  // hermana con el mismo prefijo (p.ej. "uploads-backup") cuele el check.
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) {
    return NextResponse.json({ error: "Ruta no válida." }, { status: 400 });
  }

  try {
    const info = await stat(destino);
    if (!info.isFile()) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

    const contenido = await readFile(destino);
    const ext = path.extname(destino).toLowerCase();

    return new NextResponse(new Uint8Array(contenido), {
      headers: {
        "Content-Type": TIPOS[ext] || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }
}
