import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { crearNotificacion } from "@/lib/notificaciones";
import { parsePedido, origenRolFor, destinoRolFor, totalPorTipo } from "@/lib/envioLabel";
import { cerrarOrigen } from "@/lib/envios";
import { etiquetaTipo } from "@/lib/materialLabel";

// Permite devolver un error de negocio concreto (con su propio status) desde
// dentro de un prisma.$transaction() sin que Prisma lo trate como un fallo
// de la propia transacción — se atrapa fuera y se traduce a NextResponse.
class ScanError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

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

  // El recuento de escaneados (¿ya llegamos al cupo del pedido? ¿ya está
  // todo confirmado en destino?) se vuelve a leer DENTRO de la transacción,
  // no del `envio.items` cacheado de arriba — si dos personas escanean casi
  // a la vez en el mismo envío, la segunda transacción espera a que la
  // primera confirme y ve ya reflejado su cambio, en vez de decidir sobre
  // datos obsoletos (evita duplicar el cierre o superar el cupo pedido).
  let cerrarOrigenAhora = false;
  let notificarRecibidoTotal: number | null = null;

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

    const totalDeTipo = totalPorTipo(pedido).get(material.tipo);
    if (!totalDeTipo) {
      const nombreTipo = etiquetaTipo(material);
      return NextResponse.json({ error: `Este pedido no incluye ${nombreTipo}.` }, { status: 409 });
    }

    const estadoTransito =
      envio.tipo === "RECOGIDA"
        ? "EN_TRANSITO_RECOGIDA"
        : envio.tipo === "TRANSFERENCIA"
          ? "EN_TRANSITO_TRANSFERENCIA"
          : "EN_TRANSITO_ENVIO";

    try {
      await prisma.$transaction(async (tx) => {
        const itemsActuales = await tx.envioItem.findMany({ where: { envioId: envio.id }, include: { material: true } });
        if (itemsActuales.some((i) => i.materialId === material.id)) {
          throw new ScanError("Ese material ya se ha escaneado en este movimiento.");
        }
        // Puede haber varias líneas del mismo tipo en el pedido (varias
        // líneas "Otro" con descripciones distintas) — cuentan juntas.
        const yaEscaneadosDeTipo = itemsActuales.filter((i) => i.material.tipo === material.tipo).length;
        if (yaEscaneadosDeTipo >= totalDeTipo) {
          throw new ScanError(`Ya se ha escaneado la cantidad pedida de ese tipo (${totalDeTipo}).`);
        }

        await tx.envioItem.create({
          data: { envioId: envio.id, materialId: material.id, escaneadoOrigen: true, fechaEscaneoOrigen: now },
        });
        await tx.material.update({ where: { id: material.id }, data: { estado: estadoTransito } });

        const totalPedido = pedido.reduce((s, p) => s + p.cantidad, 0);
        if (itemsActuales.length + 1 >= totalPedido) cerrarOrigenAhora = true;
      });
    } catch (err) {
      if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }

    if (cerrarOrigenAhora) await cerrarOrigen(envio.id, now);
  } else {
    const estadoFinal = envio.tipo === "ENVIO" ? "EN_TECNICO" : destinoRol === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM";

    try {
      await prisma.$transaction(async (tx) => {
        const itemsActuales = await tx.envioItem.findMany({ where: { envioId: envio.id } });
        const item = itemsActuales.find((i) => i.materialId === material.id && i.escaneadoOrigen);
        if (!item) {
          throw new ScanError("Ese material no fue registrado como enviado en este movimiento.", 404);
        }
        if (item.escaneadoDestino) {
          throw new ScanError("Ese material ya se ha confirmado en destino.");
        }

        await tx.envioItem.update({ where: { id: item.id }, data: { escaneadoDestino: true, fechaEscaneoDestino: now } });
        await tx.material.update({
          where: { id: material.id },
          data: { estado: estadoFinal, tecnicoId: envio.tipo === "ENVIO" ? envio.tecnicoId : null },
        });

        const totalEnviado = itemsActuales.length; // fijo desde que se cerró el origen
        const totalConfirmado = itemsActuales.filter((i) => i.escaneadoDestino).length + 1;
        if (totalConfirmado >= totalEnviado) {
          await tx.envio.update({ where: { id: envio.id }, data: { estado: "RECIBIDO", fechaRecibido: now } });
          notificarRecibidoTotal = totalEnviado;
        }
      });
    } catch (err) {
      if (err instanceof ScanError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }

    if (notificarRecibidoTotal !== null && envio.creadoPorId) {
      await crearNotificacion({
        userId: envio.creadoPorId,
        tipo: "ENVIO_RECIBIDO",
        titulo: envio.tipo === "ENVIO" ? "Envío confirmado por el técnico" : "Movimiento confirmado en destino",
        mensaje: `${notificarRecibidoTotal} artículo(s) recibidos en ${envio.destino}.`,
        entidadTipo: "envio",
        entidadId: envio.id,
      });
    }
  }

  const final = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  syncToSheets(["envios", "materiales", "tecnicos"]).catch((err) =>
    console.error("[envios/scan] Error sincronizando Sheets:", err)
  );

  return NextResponse.json({ envio: final, material });
}
