import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { origenRolFor } from "@/lib/envioLabel";
import { enviarCorreoTransportista } from "@/lib/envios";

/**
 * Lo rellena quien tiene el rol de origen (el almacén que prepara el envío,
 * o el técnico si es una recogida) cuando Admira ha creado el movimiento con
 * Maresa/Rhenus sin conocer todavía el bulto real (ver POST /api/envios).
 * Al guardar, se dispara el email al transportista.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const envio = await prisma.envio.findUnique({ where: { id: params.id } });
  if (!envio) return NextResponse.json({ error: "Envío no encontrado." }, { status: 404 });

  if (envio.emailTransportistaEstado !== "PENDIENTE_DATOS" && envio.emailTransportistaEstado !== "ERROR") {
    return NextResponse.json({ error: "Este movimiento no está esperando datos de transporte." }, { status: 409 });
  }

  const origenRol = origenRolFor(envio);
  if (session.role !== origenRol) {
    return NextResponse.json({ error: "No te corresponde rellenar estos datos." }, { status: 403 });
  }
  if (session.role === "TECNICO" && envio.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Este envío no pertenece a tu cuenta." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  // Reintentar tras un error: si no llega ningún dato nuevo y ya había datos
  // guardados de un intento anterior, se reutilizan sin volver a pedirlos.
  const reintentoSinCambios = envio.emailTransportistaEstado === "ERROR" && (!body || Object.keys(body).length === 0);
  const d = reintentoSinCambios ? envio : body || {};
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
      { error: `Para avisar a ${envio.transportista} hace falta indicar: ${camposFaltantes.join(", ")}.` },
      { status: 400 }
    );
  }

  await prisma.envio.update({
    where: { id: envio.id },
    data: {
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
    },
  });

  await enviarCorreoTransportista(envio.id);

  const final = await prisma.envio.findUnique({
    where: { id: envio.id },
    include: { items: { include: { material: true } }, tecnico: true },
  });

  return NextResponse.json({ envio: final });
}
