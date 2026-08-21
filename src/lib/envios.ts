import { prisma } from "./prisma";
import { crearNotificacion, notificarEquipoAdmira, notificarEquipoFDM } from "./notificaciones";
import { origenRolFor, parsePedido } from "./envioLabel";
import { emailTransportista, construirCorreoTransportista } from "./transportistas";
import { sendEmail } from "./email";

/**
 * Cuando el pedido queda completo en origen, el movimiento pasa a EN_TRANSITO
 * y se avisa a quien corresponda. Se comparte entre el cierre automático (al
 * escanear la última unidad pedida) y el cierre anticipado manual (cuando el
 * almacén da por enviado lo que ha escaneado aunque no llegue a completar el
 * pedido, p. ej. por falta de stock).
 */
export async function cerrarOrigen(envioId: string, fecha: Date): Promise<void> {
  const envio = await prisma.envio.update({
    where: { id: envioId },
    data: { estado: "EN_TRANSITO", fechaEnviado: fecha },
    include: { items: true },
  });

  if (envio.tipo === "ENVIO" && envio.tecnicoId) {
    await crearNotificacion({
      userId: envio.tecnicoId,
      tipo: "ENVIO_EN_CAMINO",
      titulo: "Tu envío está en camino",
      mensaje: `${envio.items.length} artículo(s) por ${envio.transportista}.`,
      entidadTipo: "envio",
      entidadId: envio.id,
    });
  } else if (envio.creadoPorId) {
    await crearNotificacion({
      userId: envio.creadoPorId,
      tipo: "ENVIO_EN_CAMINO",
      titulo: envio.tipo === "RECOGIDA" ? `Recogida en camino a ${envio.destino}` : "Transferencia en camino",
      mensaje: `${envio.items.length} artículo(s) por ${envio.transportista}, desde ${envio.origen}.`,
      entidadTipo: "envio",
      entidadId: envio.id,
    });
  }
}

/**
 * Cierre con discrepancia: alguien confirma su lado (origen o destino) sin
 * que se haya escaneado todo lo esperado. Nunca se inventa nada — se marca
 * el movimiento como INCIDENCIA y se avisa a todo el equipo Admira con el
 * detalle exacto de qué falta, para que puedan revisarlo y corregir el Excel
 * de stock si hace falta.
 */
export async function avisarDiscrepancia(params: {
  envioId: string;
  lado: "origen" | "destino";
  faltantes: { numeroSerie: string; tipo: string; nombreTipo: string }[];
  totalEsperado: number;
  totalReal: number;
}): Promise<void> {
  const { envioId, lado, faltantes, totalEsperado, totalReal } = params;
  const envio = await prisma.envio.findUnique({ where: { id: envioId } });
  if (!envio) return;

  const detalleFaltantes = faltantes
    .map((f) => (f.numeroSerie ? `${f.numeroSerie} (${f.nombreTipo})` : f.nombreTipo))
    .join(", ");

  await notificarEquipoAdmira({
    tipo: "ENVIO_INCIDENCIA_STOCK",
    titulo:
      lado === "origen"
        ? `Envío salió incompleto: ${totalReal}/${totalEsperado}`
        : `Discrepancia al recibir: faltan ${faltantes.length} de ${totalEsperado}`,
    mensaje:
      lado === "origen"
        ? `${envio.origen} → ${envio.destino}. No se pudo completar el pedido (faltó: ${detalleFaltantes || "sin detalle"}). Revisa el stock disponible.`
        : `${envio.origen} → ${envio.destino}. Se confirmó la recepción con material sin llegar: ${detalleFaltantes}. Revisa qué ha pasado y corrige el Excel de stock si hace falta.`,
    entidadTipo: "envio",
    entidadId: envioId,
  });
}

/**
 * Avisa a quien tiene el rol de origen (el almacén que prepara el envío, o
 * el técnico si es una recogida) de que hace falta que rellene los datos de
 * bulto/recogida antes de poder avisar al transportista — se llama al crear
 * un envío con Maresa/Rhenus cuyo origen no es quien lo está creando (ej.
 * Admira pide un envío desde el almacén FDM).
 */
export async function notificarDatosTransportePendientes(envio: {
  id: string;
  tipo: string;
  almacen: string;
  tecnicoId: string | null;
  origen: string;
  destino: string;
}): Promise<void> {
  const origenRol = origenRolFor(envio);
  const datos = {
    tipo: "ENVIO_DATOS_TRANSPORTE_PENDIENTES" as const,
    titulo: "Rellena los datos para el transportista",
    mensaje: `${envio.origen} → ${envio.destino}. Antes de avisar al transportista necesitamos día/horario de recogida, bulto y dimensiones.`,
    entidadTipo: "envio" as const,
    entidadId: envio.id,
  };
  if (origenRol === "TECNICO" && envio.tecnicoId) {
    await crearNotificacion({ userId: envio.tecnicoId, ...datos });
  } else if (origenRol === "FDM") {
    await notificarEquipoFDM(datos);
  } else if (origenRol === "ADMIRA") {
    await notificarEquipoAdmira(datos);
  }
}

/**
 * Compone y manda el correo al transportista (Maresa/Rhenus) con los datos
 * ya rellenados, y deja constancia del resultado en el propio Envio. Nunca
 * lanza — un fallo de envío se guarda como estado "ERROR" con el detalle,
 * visible en el tablero, en vez de romper la acción que lo disparó.
 */
export async function enviarCorreoTransportista(envioId: string): Promise<void> {
  const envio = await prisma.envio.findUnique({ where: { id: envioId } });
  if (!envio) return;

  const destinatario = emailTransportista(envio.transportista);
  if (!destinatario) {
    await prisma.envio.update({
      where: { id: envioId },
      data: {
        emailTransportistaEstado: "ERROR",
        emailTransportistaError: `Falta configurar el email de ${envio.transportista} (variable de entorno).`,
      },
    });
    return;
  }

  const pedido = parsePedido(envio.pedido);
  const { subject, text } = construirCorreoTransportista({ envio, pedido });
  const resultado = await sendEmail({ to: destinatario, subject, text });

  if (resultado.estado === "ERROR") {
    await prisma.envio.update({
      where: { id: envioId },
      data: { emailTransportistaEstado: "ERROR", emailTransportistaError: resultado.detalle || "Error desconocido." },
    });
    return;
  }

  await prisma.envio.update({
    where: { id: envioId },
    data: { emailTransportistaEstado: "ENVIADO", emailTransportistaEnviadoEn: new Date(), emailTransportistaError: null },
  });

  if (envio.creadoPorId) {
    await crearNotificacion({
      userId: envio.creadoPorId,
      tipo: "ENVIO_TRANSPORTISTA_AVISADO",
      titulo: `${envio.transportista} avisado`,
      mensaje: `${envio.origen} → ${envio.destino}. Correo de recogida enviado${resultado.estado === "SIMULADO" ? " (simulado, SMTP sin configurar)" : ""}.`,
      entidadTipo: "envio",
      entidadId: envio.id,
    });
  }
}
