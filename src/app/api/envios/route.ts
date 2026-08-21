import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { calcularProximaEjecucion } from "@/lib/ordenesRecurrentes";
import { crearNotificacion } from "@/lib/notificaciones";
import { nombreAlmacen, almacenOpuesto, etiquetaPedido, validarPedido, origenRolFor } from "@/lib/envioLabel";
import { TRANSPORTISTAS_CON_EMAIL_AUTOMATICO } from "@/lib/constants";
import { enviarCorreoTransportista, notificarDatosTransportePendientes } from "@/lib/envios";

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
      tecnico: { select: { id: true, name: true, zona: true, direccion: true } },
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
  const {
    tipo,
    transportista,
    almacen,
    tecnicoId,
    pedido,
    esRecurrente,
    frecuenciaDias,
    notas,
    datosTransporte,
  } = body || {};

  if (!["ENVIO", "RECOGIDA", "TRANSFERENCIA"].includes(tipo)) {
    return NextResponse.json({ error: "Tipo de movimiento no válido." }, { status: 400 });
  }
  if (!transportista) {
    return NextResponse.json({ error: "Falta el transportista." }, { status: 400 });
  }
  if (almacen !== "FDM" && almacen !== "ADMIRA") {
    return NextResponse.json({ error: "Indica el almacén de origen." }, { status: 400 });
  }

  // Con Maresa/Rhenus hace falta avisar por email al transportista. Si quien
  // está creando el envío es también el origen (Admira → técnico/almacén
  // desde el propio almacén Admira), ya conoce el bulto real y lo rellena
  // ahora mismo; si el origen es FDM o un técnico (recogida), esos datos
  // todavía no existen y se pedirán después — ver notificarDatosTransportePendientes.
  const conEmailAutomatico = TRANSPORTISTAS_CON_EMAIL_AUTOMATICO.includes(transportista);
  const origenEsQuienCrea = conEmailAutomatico && origenRolFor({ tipo, almacen }) === "ADMIRA";
  let datosTransporteValidados: Record<string, unknown> | null = null;
  if (origenEsQuienCrea) {
    const d = datosTransporte || {};
    const camposFaltantes: string[] = [];
    if (!d.fechaRecogida) camposFaltantes.push("día de recogida");
    if (!d.franjaRecogida) camposFaltantes.push("horario de recogida");
    if (!d.tipoBulto) camposFaltantes.push("tipo de bulto");
    if (!d.bultoLargoCm || !d.bultoAnchoCm || !d.bultoAltoCm) camposFaltantes.push("dimensiones del bulto");
    if (!d.bultoPesoKg) camposFaltantes.push("peso del bulto");
    if (!d.direccionRecogida) camposFaltantes.push("dirección de recogida");
    if (!d.direccionEntrega) camposFaltantes.push("dirección de entrega");
    if (camposFaltantes.length > 0) {
      return NextResponse.json(
        { error: `Para avisar a ${transportista} hace falta indicar: ${camposFaltantes.join(", ")}.` },
        { status: 400 }
      );
    }
    datosTransporteValidados = {
      fechaRecogida: new Date(d.fechaRecogida),
      franjaRecogida: String(d.franjaRecogida),
      tipoBulto: String(d.tipoBulto),
      bultoLargoCm: Number(d.bultoLargoCm),
      bultoAnchoCm: Number(d.bultoAnchoCm),
      bultoAltoCm: Number(d.bultoAltoCm),
      bultoPesoKg: Number(d.bultoPesoKg),
      detalleTransporte: d.detalleTransporte ? String(d.detalleTransporte).trim() : null,
      ciudadRecogida: d.ciudadRecogida ? String(d.ciudadRecogida).trim() : null,
      direccionRecogida: String(d.direccionRecogida).trim(),
      ciudadEntrega: d.ciudadEntrega ? String(d.ciudadEntrega).trim() : null,
      direccionEntrega: String(d.direccionEntrega).trim(),
    };
  }

  const resultadoPedido = validarPedido(pedido);
  if ("error" in resultadoPedido) {
    return NextResponse.json({ error: resultadoPedido.error }, { status: 400 });
  }
  const pedidoValidado = resultadoPedido.pedido;

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
      ...(conEmailAutomatico
        ? {
            emailTransportistaEstado: origenEsQuienCrea ? null : "PENDIENTE_DATOS",
            ...(datosTransporteValidados || {}),
          }
        : {}),
    },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  await syncToSheets(["envios"]);

  if (conEmailAutomatico) {
    if (origenEsQuienCrea) {
      // Ya tenemos todo lo necesario: se avisa al transportista al instante.
      await enviarCorreoTransportista(envio.id);
    } else {
      // El origen real (FDM o el técnico) todavía tiene que rellenar el bulto.
      await notificarDatosTransportePendientes(envio);
    }
  }

  const resumenPedido = etiquetaPedido(pedidoValidado);

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
