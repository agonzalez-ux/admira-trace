import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia || incidencia.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const codigoBarras = body?.codigoBarras?.trim();
  if (!codigoBarras) return NextResponse.json({ error: "Código de barras requerido." }, { status: 400 });

  const material = await prisma.material.findUnique({ where: { codigoBarras } });
  if (!material) return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  if (material.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Ese material no está registrado en tu inventario." }, { status: 409 });
  }
  if (material.estado === "INSTALADO") {
    return NextResponse.json({ error: "Ese material ya figura como instalado." }, { status: 409 });
  }

  const registro = await prisma.incidenciaMaterial.create({
    data: { incidenciaId: params.id, materialId: material.id },
    include: { material: true },
  });

  await prisma.material.update({ where: { id: material.id }, data: { estado: "INSTALADO" } });

  await prisma.materialEvento.create({
    data: {
      materialId: material.id,
      tipo: "INSTALACION",
      usuarioId: session.userId,
      incidenciaId: params.id,
      notas: `Instalado en incidencia: ${incidencia.titulo}`,
    },
  });

  await syncToSheets(["incidencias", "materiales", "intervenciones", "censo"]);

  return NextResponse.json({ registro });
}
