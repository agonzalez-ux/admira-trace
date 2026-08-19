import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { calcularProximaEjecucion } from "@/lib/ordenesRecurrentes";
import { crearNotificacion } from "@/lib/notificaciones";
import { TIPO_MATERIAL_LABELS, TIPOS_MATERIAL } from "@/lib/constants";
import { nombreAlmacen, almacenOpuesto, type PedidoItem } from "@/lib/envioLabel";

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

function validarPedido(pedido: unknown): PedidoItem[] | null {
  if (!Array.isArray(pedido) || pedido.length === 0) return null;
  const limpio: PedidoItem[] = [];
  for (const item of pedido) {
    const tipo = item?.tipo;
    const cantidad = Number(item?.cantidad);
    if (!TIPOS_MATERIAL.includes(tipo)) return null;
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue; // se ignoran las categorías a 0
    limpio.push({ tipo, cantidad });
  }
  return limpio.length > 0 ? limpio : null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede crear envíos." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { tipo, transportista, almacen, tecnicoId, pedido, esRecurrente, frecuenciaDias, notas } = body || {};

  if (!["ENVIO", "RECOGIDA", "TRANSFERENCIA"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo de movimiento no válido." }, { status: 400 });
  }
  if (!transportista) {
    return NextResponse.json({ error: "Falta el transportista." }, { status: 400 });
  }
  if (almacen !== "FDM" && almacen !== "ADMIRA") {
    return NextResponse.json({ error: "Indica el almacén de origen." }, { status: 400 });
  }

  const pedidoValidado = validarPedido(pedido);
  if (!pedidoValidado) {
    return NextResponse.json(
      { error: "Indica al menos una categoría de material con cantidad mayor que 0." },
      { status: 400 }
    );
  }

  let tecnico: { id: string; name: string } | null = null;
  if (tipo === "TRANSFERENCIA") {
    if (tecnicoId) {
      return NextResponse.json({ error: "Una transferencia es entre almacenes, no lleva técnico." }, { status: 400 });
    }
    if (esRecurrente) {
      return NextResponse.json({ error: "Las transferencias entre almacenes no pueden ser recurrentes." }, { status: 400 });
    }
  } else {
    if (!tecnicoId) return NextResponse.json({ error: "Selecciona un técnico." }, { status: 400 });
    const t = await prisma.user.findUnique({ where: { id: tecnicoId } });
    if (!t || t.role !== "TECNICO") {
      return NextResponse.json({ error: "Técnico no válido." }, { status: 400 });
    }
    tecnico = t;
  }

  const almacenNombre = nombreAlmacen(almacen);
  const origen = tipo === "ENVIO" ? almacenNombre : tipo === "RECOGIDA" ? tecnico!.name : almacenNombre;
  const destino =
    tipo === "ENVIO" ? tecnico!.name : tipo === "RECOGIDA" ? almacenNombre : nombreAlmacen(almacenOpuesto(almacen));

  // Si es recurrente, se crea también la orden que generará los siguientes envíos
  // automáticamente, con el mismo pedido por categorías.
  let ordenRecurrenteId: string | null = null;
  if (esRecurrente && tipo === "ENVIO") {
    const dias = Number(frecuenciaDias);
    if (!dias || dias < 1) {
      return NextResponse.json({ error: "Indica cada cuántos días se repite el envío recurrente." }, { status: 400 });
    }

    const orden = await prisma.ordenRecurrente.create({
      data: {
        tecnicoId,
        frecuenciaDias: dias,
        transportista,
        almacen,
        materialConfig: JSON.stringify(pedidoValidado),
        notas: notas || null,
        creadoPorId: session.userId,
        ultimaEjecucion: new Date(),
        proximaEjecucion: calcularProximaEjecucion(new Date(), dias),
      },
    });
    ordenRecurrenteId = orden.id;
  }

  // Ojo: no se crea ningún EnvioItem todavía — las piezas concretas se van
  // enlazando una a una a medida que el almacén las escanea de verdad (ver
  // /api/envios/[id]/scan). Este pedido es solo el plan.
  const envio = await prisma.envio.create({
    data: {
      tipo,
      transportista,
      origen,
      destino,
      almacen,
      tecnicoId: tecnicoId || null,
      pedido: JSON.stringify(pedidoValidado),
      esRecurrente: !!esRecurrente,
      ordenRecurrenteId,
      notas: notas || null,
      creadoPorId: session.userId,
    },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios"]);

  const resumenPedido = pedidoValidado
    .map((p) => `${p.cantidad} ${TIPO_MATERIAL_LABELS[p.tipo as keyof typeof TIPO_MATERIAL_LABELS] || p.tipo}`)
    .join(", ");

  if (tecnicoId) {
    await crearNotificacion({
      userId: tecnicoId,
      tipo: "ENVIO_CREADO",
      titulo: tipo === "RECOGIDA" ? "Nueva recogida programada" : "Nuevo envío en camino",
      mensaje: `${resumenPedido} por ${transportista}, desde ${origen}.`,
      entidadTipo: "envio",
      entidadId: envio.id,
    });
  }

  return NextResponse.json({ envio, ordenRecurrente: Boolean(ordenRecurrenteId) });
}
