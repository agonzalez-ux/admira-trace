import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || (session.role !== "FDM" && session.role !== "TECNICO")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const codigoBarras = body?.codigoBarras?.trim();
  if (!codigoBarras) {
    return NextResponse.json({ error: "Código de barras requerido." }, { status: 400 });
  }

  const envio = await prisma.envio.findUnique({
    where: { id: params.id },
    include: { items: { include: { material: true } } },
  });
  if (!envio) return NextResponse.json({ error: "Envío no encontrado." }, { status: 404 });

  if (session.role === "TECNICO" && envio.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Este envío no pertenece a tu cuenta." }, { status: 403 });
  }

  // Determinar qué lado corresponde escanear según el tipo de movimiento y el rol.
  // ENVIO: origen = FDM, destino = Técnico
  // RECOGIDA: origen = Técnico, destino = FDM
  const origenRol = envio.tipo === "ENVIO" ? "FDM" : "TECNICO";
  const destinoRol = envio.tipo === "ENVIO" ? "TECNICO" : "FDM";

  let side: "origen" | "destino";
  if (session.role === origenRol && !envio.items.every((i) => i.escaneadoOrigen)) {
    side = "origen";
  } else if (session.role === destinoRol) {
    side = "destino";
  } else {
    return NextResponse.json({ error: "No te corresponde escanear este envío en este momento." }, { status: 403 });
  }

  const item = envio.items.find((i) => i.material.codigoBarras === codigoBarras);
  if (!item) {
    return NextResponse.json({ error: "Ese material no pertenece a este envío." }, { status: 404 });
  }
  if (side === "origen" && item.escaneadoOrigen) {
    return NextResponse.json({ error: "Ese material ya fue escaneado en origen." }, { status: 409 });
  }
  if (side === "destino") {
    if (!item.escaneadoOrigen) {
      return NextResponse.json({ error: "Ese material todavía no ha sido enviado desde origen." }, { status: 409 });
    }
    if (item.escaneadoDestino) {
      return NextResponse.json({ error: "Ese material ya fue confirmado en destino." }, { status: 409 });
    }
  }

  const now = new Date();

  await prisma.envioItem.update({
    where: { id: item.id },
    data:
      side === "origen"
        ? { escaneadoOrigen: true, fechaEscaneoOrigen: now }
        : { escaneadoDestino: true, fechaEscaneoDestino: now },
  });

  await prisma.materialEvento.create({
    data: {
      materialId: item.materialId,
      tipo: side === "origen" ? "ENVIO_PREPARADO_FDM" : envio.tipo === "ENVIO" ? "RECEPCION_TECNICO" : "DEVOLUCION_FDM",
      usuarioId: session.userId,
      envioId: envio.id,
      notas: `${envio.tipo} · ${side === "origen" ? "Escaneado en origen" : "Confirmado en destino"}`,
    },
  });

  if (side === "origen") {
    await prisma.material.update({
      where: { id: item.materialId },
      data: { estado: envio.tipo === "ENVIO" ? "EN_TRANSITO_ENVIO" : "EN_TRANSITO_RECOGIDA" },
    });
  } else {
    await prisma.material.update({
      where: { id: item.materialId },
      data:
        envio.tipo === "ENVIO"
          ? { estado: "EN_TECNICO", tecnicoId: envio.tecnicoId }
          : { estado: "EN_FDM", tecnicoId: null },
    });
  }

  const refreshed = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } } },
  });

  if (refreshed) {
    const allOrigen = refreshed.items.every((i) => i.escaneadoOrigen);
    const allDestino = refreshed.items.every((i) => i.escaneadoDestino);

    if (side === "origen" && allOrigen && envio.estado === "PENDIENTE_PREPARACION") {
      await prisma.envio.update({
        where: { id: envio.id },
        data: { estado: "EN_TRANSITO", fechaEnviado: now },
      });
    }
    if (side === "destino" && allDestino && envio.estado !== "RECIBIDO") {
      await prisma.envio.update({
        where: { id: envio.id },
        data: { estado: "RECIBIDO", fechaRecibido: now },
      });
    }
  }

  const final = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios", "materiales", "tecnicos"]);

  return NextResponse.json({ envio: final, material: item.material });
}
