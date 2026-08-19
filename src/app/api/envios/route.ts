import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { calcularProximaEjecucion } from "@/lib/ordenesRecurrentes";
import { crearNotificacion } from "@/lib/notificaciones";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const where: any = {};
  if (session.role === "TECNICO") {
    where.tecnicoId = session.userId;
  }
  // FDM y Admira ven todos los envíos

  const envios = await prisma.envio.findMany({
    where,
    include: {
      tecnico: { select: { id: true, name: true, zona: true } },
      creadoPor: { select: { name: true } },
      items: { include: { material: true } },
    },
    orderBy: { fechaCreacion: "desc" },
  });

  return NextResponse.json({ envios });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede crear envíos." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { tipo, transportista, origen, destino, almacen, tecnicoId, materialIds, esRecurrente, frecuenciaDias, notas } =
    body || {};

  if (!tipo || !transportista || !origen || !destino || !tecnicoId || !Array.isArray(materialIds) || materialIds.length === 0) {
    return NextResponse.json({ error: "Faltan campos obligatorios o no hay material seleccionado." }, { status: 400 });
  }
  if (almacen !== "FDM" && almacen !== "ADMIRA") {
    return NextResponse.json({ error: "Indica de qué almacén sale (o a qué almacén vuelve) el material." }, { status: 400 });
  }

  const tecnico = await prisma.user.findUnique({ where: { id: tecnicoId } });
  if (!tecnico || tecnico.role !== "TECNICO") {
    return NextResponse.json({ error: "Técnico no válido." }, { status: 400 });
  }

  // Si es recurrente, se crea también la orden que generará los siguientes envíos
  // automáticamente, con los mismos tipos y cantidades que este primer envío.
  let ordenRecurrenteId: string | null = null;
  if (esRecurrente && tipo === "ENVIO") {
    const dias = Number(frecuenciaDias);
    if (!dias || dias < 1) {
      return NextResponse.json({ error: "Indica cada cuántos días se repite el envío recurrente." }, { status: 400 });
    }

    const seleccionados = await prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { tipo: true },
    });
    const conteo = new Map<string, number>();
    for (const m of seleccionados) conteo.set(m.tipo, (conteo.get(m.tipo) || 0) + 1);
    const config = Array.from(conteo.entries()).map(([t, cantidad]) => ({ tipo: t, cantidad }));

    const orden = await prisma.ordenRecurrente.create({
      data: {
        tecnicoId,
        frecuenciaDias: dias,
        transportista,
        almacen,
        materialConfig: JSON.stringify(config),
        notas: notas || null,
        creadoPorId: session.userId,
        ultimaEjecucion: new Date(),
        proximaEjecucion: calcularProximaEjecucion(new Date(), dias),
      },
    });
    ordenRecurrenteId = orden.id;
  }

  const envio = await prisma.envio.create({
    data: {
      tipo,
      transportista,
      origen,
      destino,
      almacen,
      tecnicoId,
      esRecurrente: !!esRecurrente,
      ordenRecurrenteId,
      notas: notas || null,
      creadoPorId: session.userId,
      items: {
        create: materialIds.map((materialId: string) => ({ materialId })),
      },
    },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios", "materiales"]);

  const esRecogida = envio.tipo === "RECOGIDA";
  await crearNotificacion({
    userId: tecnicoId,
    tipo: "ENVIO_CREADO",
    titulo: esRecogida ? "Nueva recogida programada" : "Nuevo envío en camino",
    mensaje: `${envio.items.length} artículo(s) por ${transportista}, desde ${origen}.`,
    entidadTipo: "envio",
    entidadId: envio.id,
  });

  return NextResponse.json({ envio, ordenRecurrente: Boolean(ordenRecurrenteId) });
}
