import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { syncToSheets } from "@/lib/googleSheets";
import { UPLOADS_DIR } from "@/lib/uploads";
import { CLOUDINARY_CONFIGURADO, subirFotoCloudinary } from "@/lib/cloudinary";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia || incidencia.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("foto") as File | null;
  if (!file) return NextResponse.json({ error: "No se ha recibido ninguna foto." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let url: string;

  if (CLOUDINARY_CONFIGURADO) {
    // En Render (sin disco persistente) las fotos se guardan en Cloudinary,
    // que devuelve una URL pública propia que ya sirve directamente la imagen.
    url = await subirFotoCloudinary(buffer, `incidencias/${params.id}`);
  } else {
    // En local, o en un hosting con disco propio, se guardan en UPLOADS_DIR
    // y se sirven a través de nuestra propia ruta autenticada.
    const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const dir = path.join(UPLOADS_DIR, "incidencias", params.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buffer);
    url = `/api/uploads/incidencias/${params.id}/${fileName}`;
  }

  const foto = await prisma.fotoEvidencia.create({
    data: { incidenciaId: params.id, url },
  });

  await syncToSheets("incidencias");

  return NextResponse.json({ foto });
}
