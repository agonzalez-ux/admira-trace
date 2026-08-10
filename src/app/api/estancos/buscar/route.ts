import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Búsqueda rápida de estancos por nombre o código, para el selector manual
 * que usa Admira cuando el emparejador automático del desk no encuentra el
 * estanco de una incidencia.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ estancos: [] });

  const estancos = await prisma.estanco.findMany({
    where: {
      OR: [{ nombre: { contains: q } }, { idEstanco: { contains: q } }, { municipio: { contains: q } }],
    },
    select: { id: true, idEstanco: true, nombre: true, municipio: true, provincia: true },
    take: 20,
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json({ estancos });
}
