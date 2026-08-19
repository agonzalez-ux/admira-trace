import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { numeroSerie: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const material = await prisma.material.findUnique({
    where: { numeroSerie: decodeURIComponent(params.numeroSerie) },
    include: {
      tecnico: { select: { id: true, name: true, zona: true } },
      eventos: { orderBy: { fecha: "desc" }, take: 20, include: { usuario: { select: { name: true } } } },
    },
  });

  if (!material) {
    return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ material });
}
