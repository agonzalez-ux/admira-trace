import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { crearNotificacion } from "@/lib/notificaciones";
import { parsePedido, origenRolFor, destinoRolFor } from "@/lib/envioLabel";
import { cerrarOrigen } from "@/lib/envios";
import { TIPO_MATERIAL_LABELS } from "@/lib/constants";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || (session.role !== "FDM" && session.role !== "ADMIRA" && session.role !== "TECNICO")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const numeroSerie = body?.numeroSerie?.trim();
  if (!numeroSerie) {
    return NextResponse.json({ error: "Número de serie requerido." }, { status: 400 });
  }

  const envio = await prisma.envio.findUnique({
    where: { id: params.id },
    include: { items: { include: { material: true } } },
  });
  if (!envio) return NextResponse.json({ error: "Envío no encontrado." }, { status: 404 });

  if (session.role === "TECNICO" && envio.tecnicoId && envio.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Este envío no pertenece a tu cuenta." }, { status: 403 });
  }

  // El lado "almacén" de este movimiento es FDM o Admira según con qué
  // almacén se creó (o los dos, si es una transferencia entre ambos) — un
  // miembro de FDM no puede escanear un movimiento que no le corresponde, y
  // viceversa. Las transferencias no llevan técnico de por medio.
  const origenRol = origenRolFor(envio);
  const destinoRol = destinoRolFor(envio);
  if (session.role !== "TECNICO" && session.role !== origenRol && session.role !== destinoRol) {
    return NextResponse.json({ error: "Este movimiento no corresponde a tu almacén." }, { status: 403 });
  }
  if (session.role === "TECNICO" && origenRol !== "TECNICO" && destinoRol !== "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  let side: "origen" | "destino";
  if (session.role === origenRol && envio.estado === "PENDIENTE_PREPARACION") {
    side = "origen";
  } else if (session.role === destinoRol && envio.estado === "EN_TRANSITO") {
    side = "destino";
  } else {
    return NextResponse.json({ error: "No te corresponde escanear este movimiento en este momento." }, { status: 403 });
  }

  const material = await prisma.material.findUnique({ where: { numeroSerie } });
  if (!material) return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });

  const pedido = parsePedido(envio.pedido);
  const now = new Date();

  if (side === "origen") {
    const estadoEsperado = envio.tipo === "RECOGIDA" ? "EN_TECNICO" : envio.almacen === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM";
    if (material.estado !== estadoEsperado) {
      return NextResponse.json(
        { error: `Ese material no está disponible para este movimiento (está "${material.estado}").` },
        { status: 409 }
      );
    }
    if (envio.tipo === "RECOGIDA" && material.tecnicoId !== envio.tecnicoId) {
      return NextResponse.json({ error: "Ese material no está en poder de este técnico." }, { status: 409 });
    }
    if (envio.items.some((i) => i.materialId === material.id)) {
      return NextResponse.json({ error: "Ese material ya se ha escaneado en este movimiento." }, { status: 409 });
    }

    const pedidoDeTipo = pedido.find((p) => p.tipo === material.tipo);
    if (!pedidoDeTipo) {
      const nombreTipo = TIPO_MATERIAL_LABELS[material.tipo as keyof typeof TIPO_MATERIAL_LABELS] || material.tipo;
      return NextResponse.json({ error: `Este pedido no incluye ${nombreTipo}.` }, { status: 409 });
    }
    const yaEscaneadosDeTipo = envio.items.filter((i) => i.material.tipo === material.tipo).length;
    if (yaEscaneadosDeTipo >= pedidoDeTipo.cantidad) {
      return NextResponse.json(
        { error: `Ya se ha escaneado la cantidad pedida de ese tipo (${pedidoDeTipo.cantidad}).` },
        { status: 409 }
      );
    }

    const estadoTransito =
      envio.tipo === "RECOGIDA"
        ? "EN_TRANSITO_RECOGIDA"
        : envio.tipo === "TRANSFERENCIA"
          ? "EN_TRANSITO_TRANSFERENCIA"
          : "EN_TRANSITO_ENVIO";

    await prisma.envioItem.create({
      data: { envioId: envio.id, materialId: material.id, escaneadoOrigen: true, fechaEscaneoOrigen: now },
    });
    await prisma.material.update({ where: { id: material.id }, data: { estado: estadoTransito } });

    const totalPedido = pedido.reduce((s, p) => s + p.cantidad, 0);
    const totalEscaneado = envio.items.length + 1;
    if (totalEscaneado >= totalPedido) {
      await cerrarOrigen(envio.id, now);
    }
  } else {
    const item = envio.items.find((i) => i.materialId === material.id && i.escaneadoOrigen);
    if (!item) {
      return NextResponse.json(
        { error: "Ese material no fue registrado como enviado en este movimiento." },
        { status: 404 }
      );
    }
    if (item.escaneadoDestino) {
      return NextResponse.json({ error: "Ese material ya se ha confirmado en destino." }, { status: 409 });
    }

    const estadoFinal = envio.tipo === "ENVIO" ? "EN_TECNICO" : destinoRol === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM";

    await prisma.envioItem.update({ where: { id: item.id }, data: { escaneadoDestino: true, fechaEscaneoDestino: now } });
    await prisma.material.update({
      where: { id: material.id },
      data: { estado: estadoFinal, tecnicoId: envio.tipo === "ENVIO" ? envio.tecnicoId : null },
    });

    const totalEnviado = envio.items.length; // fijo desde que se cerró el origen
    const totalConfirmado = envio.items.filter((i) => i.escaneadoDestino).length + 1;
    if (totalConfirmado >= totalEnviado) {
      await prisma.envio.update({ where: { id: envio.id }, data: { estado: "RECIBIDO", fechaRecibido: now } });
      if (envio.creadoPorId) {
        await crearNotificacion({
          userId: envio.creadoPorId,
          tipo: "ENVIO_RECIBIDO",
          titulo: envio.tipo === "ENVIO" ? "Envío confirmado por el técnico" : "Movimiento confirmado en destino",
          mensaje: `${totalEnviado} artículo(s) recibidos en ${envio.destino}.`,
          entidadTipo: "envio",
          entidadId: envio.id,
        });
      }
    }
  }

  const final = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios", "materiales"]);

  return NextResponse.json({ envio: final, material });
}
