import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { parsePedido, origenRolFor, destinoRolFor } from "@/lib/envioLabel";
import { cerrarOrigen, avisarDiscrepancia } from "@/lib/envios";
import { TIPO_MATERIAL_LABELS } from "@/lib/constants";

/**
 * Da por cerrado el lado (origen o destino) de un envío/recogida/transferencia
 * aunque no se haya escaneado todo lo esperado — para cuando de verdad no hay
 * más que escanear (falta de stock al preparar, o algo se ha perdido por el
 * camino). Avisa a todo el equipo Admira con el detalle exacto de lo que
 * falta, para que puedan revisarlo y corregir el Excel de stock.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || (session.role !== "FDM" && session.role !== "ADMIRA" && session.role !== "TECNICO")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const envio = await prisma.envio.findUnique({
    where: { id: params.id },
    include: { items: { include: { material: true } } },
  });
  if (!envio) return NextResponse.json({ error: "Envío no encontrado." }, { status: 404 });

  if (session.role === "TECNICO" && envio.tecnicoId && envio.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Este envío no pertenece a tu cuenta." }, { status: 403 });
  }

  const origenRol = origenRolFor(envio);
  const destinoRol = destinoRolFor(envio);
  const now = new Date();

  if (session.role === origenRol && envio.estado === "PENDIENTE_PREPARACION") {
    const pedido = parsePedido(envio.pedido);
    const totalPedido = pedido.reduce((s, p) => s + p.cantidad, 0);
    const totalEscaneado = envio.items.length;

    if (totalEscaneado === 0) {
      return NextResponse.json({ error: "Todavía no has escaneado ningún material." }, { status: 400 });
    }
    if (totalEscaneado >= totalPedido) {
      return NextResponse.json({ error: "Ya se ha escaneado todo el pedido." }, { status: 400 });
    }

    // Lo que falta, por categoría, para avisar con detalle de qué no se pudo enviar.
    const escaneadosPorTipo = new Map<string, number>();
    for (const i of envio.items) escaneadosPorTipo.set(i.material.tipo, (escaneadosPorTipo.get(i.material.tipo) || 0) + 1);
    const faltantes = pedido
      .map((p) => ({ tipo: p.tipo, faltan: p.cantidad - (escaneadosPorTipo.get(p.tipo) || 0) }))
      .filter((p) => p.faltan > 0)
      .map((p) => ({
        numeroSerie: "",
        tipo: p.tipo,
        nombreTipo: `${p.faltan} × ${TIPO_MATERIAL_LABELS[p.tipo as keyof typeof TIPO_MATERIAL_LABELS] || p.tipo}`,
      }));

    await cerrarOrigen(envio.id, now);
    await avisarDiscrepancia({
      envioId: envio.id,
      lado: "origen",
      faltantes,
      totalEsperado: totalPedido,
      totalReal: totalEscaneado,
    });
  } else if (session.role === destinoRol && envio.estado === "EN_TRANSITO") {
    const totalEnviado = envio.items.length;
    const confirmados = envio.items.filter((i) => i.escaneadoDestino);

    if (confirmados.length === 0) {
      return NextResponse.json({ error: "Todavía no has confirmado ningún material." }, { status: 400 });
    }
    if (confirmados.length >= totalEnviado) {
      return NextResponse.json({ error: "Ya está todo confirmado." }, { status: 400 });
    }

    const faltantes = envio.items
      .filter((i) => !i.escaneadoDestino)
      .map((i) => ({
        numeroSerie: i.material.numeroSerie,
        tipo: i.material.tipo,
        nombreTipo: TIPO_MATERIAL_LABELS[i.material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || i.material.tipo,
      }));

    await prisma.envio.update({ where: { id: envio.id }, data: { estado: "INCIDENCIA" } });
    await avisarDiscrepancia({
      envioId: envio.id,
      lado: "destino",
      faltantes,
      totalEsperado: totalEnviado,
      totalReal: confirmados.length,
    });
  } else {
    return NextResponse.json({ error: "No te corresponde cerrar este movimiento en este momento." }, { status: 403 });
  }

  const final = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios", "materiales"]);

  return NextResponse.json({ envio: final });
}
