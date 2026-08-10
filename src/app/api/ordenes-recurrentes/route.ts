import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { calcularProximaEjecucion } from "@/lib/ordenesRecurrentes";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tecnicoId = searchParams.get("tecnicoId");

  const where: any = {};
  if (session.role === "TECNICO") where.tecnicoId = session.userId;
  else if (tecnicoId) where.tecnicoId = tecnicoId;

  const ordenes = await prisma.ordenRecurrente.findMany({
    where,
    include: { tecnico: { select: { id: true, name: true, zona: true } }, envios: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ordenes });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede crear órdenes recurrentes." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { tecnicoId, frecuenciaDias, transportista, materialConfig, notas } = body || {};

  if (!tecnicoId || !Number(frecuenciaDias) || !Array.isArray(materialConfig) || materialConfig.length === 0) {
    return NextResponse.json(
      { error: "Faltan campos: técnico, frecuencia y al menos un tipo de material con cantidad." },
      { status: 400 }
    );
  }

  const tecnico = await prisma.user.findUnique({ where: { id: tecnicoId } });
  if (!tecnico || tecnico.role !== "TECNICO") {
    return NextResponse.json({ error: "Técnico no válido." }, { status: 400 });
  }

  const limpio = materialConfig
    .filter((i: any) => i?.tipo && Number(i.cantidad) > 0)
    .map((i: any) => ({ tipo: String(i.tipo), cantidad: Number(i.cantidad) }));
  if (limpio.length === 0) {
    return NextResponse.json({ error: "Indica al menos un tipo de material con cantidad mayor que 0." }, { status: 400 });
  }

  const orden = await prisma.ordenRecurrente.create({
    data: {
      tecnicoId,
      frecuenciaDias: Number(frecuenciaDias),
      transportista: transportista || "MARESA",
      materialConfig: JSON.stringify(limpio),
      notas: notas || null,
      creadoPorId: session.userId,
      proximaEjecucion: calcularProximaEjecucion(new Date(), Number(frecuenciaDias)),
    },
    include: { tecnico: true },
  });

  return NextResponse.json({ orden });
}
