import { FRANJA_RECOGIDA_LABELS, TIPO_BULTO_LABELS, TRANSPORTISTA_LABELS, type Transportista } from "./constants";
import { etiquetaPedido, type PedidoItem } from "./envioLabel";

/**
 * Configuración de transportistas — direcciones de email y de los dos
 * almacenes propios. Vive en variables de entorno (no en el código) porque
 * son datos de contacto/negocio que pueden cambiar sin que haga falta tocar
 * ni desplegar código, igual que ya se hace con DESK_API_TOKEN o
 * NEXT_PUBLIC_WHATSAPP_PHONE.
 */
const MARESA_EMAIL = process.env.MARESA_EMAIL || "";
const RENUS_EMAIL = process.env.RENUS_EMAIL || "";
// Con NEXT_PUBLIC_ porque el botón "abrir portal de GLS" se muestra en
// componentes de cliente (EnvioCreateForm, EnviosBoard) — no es un dato
// sensible, es la URL pública del portal de GLS.
const GLS_PORTAL_URL = process.env.NEXT_PUBLIC_GLS_PORTAL_URL || "";
// También con NEXT_PUBLIC_ — sirven para autocompletar los formularios de
// envío en el cliente (dirección pública del almacén, no es un dato sensible).
const DIRECCION_ALMACEN_FDM = process.env.NEXT_PUBLIC_DIRECCION_ALMACEN_FDM || "";
const CIUDAD_ALMACEN_FDM = process.env.NEXT_PUBLIC_CIUDAD_ALMACEN_FDM || "";
const DIRECCION_ALMACEN_ADMIRA = process.env.NEXT_PUBLIC_DIRECCION_ALMACEN_ADMIRA || "";
const CIUDAD_ALMACEN_ADMIRA = process.env.NEXT_PUBLIC_CIUDAD_ALMACEN_ADMIRA || "";

export function emailTransportista(transportista: string): string | null {
  if (transportista === "MARESA") return MARESA_EMAIL || null;
  if (transportista === "RENUS") return RENUS_EMAIL || null;
  return null;
}

export function glsPortalUrl(): string | null {
  return GLS_PORTAL_URL || null;
}

export function direccionAlmacen(almacen: "FDM" | "ADMIRA"): { direccion: string; ciudad: string } {
  if (almacen === "ADMIRA") return { direccion: DIRECCION_ALMACEN_ADMIRA, ciudad: CIUDAD_ALMACEN_ADMIRA };
  return { direccion: DIRECCION_ALMACEN_FDM, ciudad: CIUDAD_ALMACEN_FDM };
}

/** Para el asunto: sin acentos ni minúsculas, más corto y siempre legible en un vistazo. */
function limpiarParaAsunto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

type DatosCorreoTransportista = {
  envio: {
    id: string;
    tipo: string;
    transportista: string;
    origen: string;
    destino: string;
    fechaRecogida: Date | null;
    franjaRecogida: string | null;
    tipoBulto: string | null;
    bultoLargoCm: number | null;
    bultoAnchoCm: number | null;
    bultoAltoCm: number | null;
    bultoPesoKg: number | null;
    detalleTransporte: string | null;
    ciudadRecogida: string | null;
    direccionRecogida: string | null;
    ciudadEntrega: string | null;
    direccionEntrega: string | null;
    notas: string | null;
  };
  pedido: PedidoItem[];
};

/**
 * Compone el asunto y el cuerpo del correo al transportista. El asunto sigue
 * el formato pedido: en mayúsculas y dejando claro de un vistazo qué es, p.
 * ej. "RECOGIDA TFTS EN BULTOS / CADIZ-BARCELONA".
 */
export function construirCorreoTransportista({ envio, pedido }: DatosCorreoTransportista): {
  subject: string;
  text: string;
} {
  const accion = envio.tipo === "RECOGIDA" ? "RECOGIDA" : "ENVIO";
  const bultoLabel = envio.tipoBulto === "PALET" ? "EN PALET" : "EN BULTOS";
  const materialCorto = pedido.map((p) => p.tipo).join("/");
  const ciudadOrigen = limpiarParaAsunto(envio.ciudadRecogida || envio.origen || "?");
  const ciudadDestino = limpiarParaAsunto(envio.ciudadEntrega || envio.destino || "?");

  const subject = `${accion} ${limpiarParaAsunto(materialCorto)} ${bultoLabel} / ${ciudadOrigen}-${ciudadDestino}`;

  const dimensiones =
    envio.bultoLargoCm && envio.bultoAnchoCm && envio.bultoAltoCm
      ? `${envio.bultoLargoCm} x ${envio.bultoAnchoCm} x ${envio.bultoAltoCm} cm`
      : "(sin especificar)";
  const peso = envio.bultoPesoKg ? `${envio.bultoPesoKg} kg` : "(sin especificar)";
  const franja = envio.franjaRecogida
    ? FRANJA_RECOGIDA_LABELS[envio.franjaRecogida as keyof typeof FRANJA_RECOGIDA_LABELS] || envio.franjaRecogida
    : "(sin especificar)";
  const fecha = envio.fechaRecogida
    ? envio.fechaRecogida.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "(sin especificar)";
  const tipoBultoLabel = envio.tipoBulto
    ? TIPO_BULTO_LABELS[envio.tipoBulto as keyof typeof TIPO_BULTO_LABELS] || envio.tipoBulto
    : "(sin especificar)";

  const text = [
    `Buenos días,`,
    ``,
    `Solicitamos una ${accion === "RECOGIDA" ? "recogida" : "recogida y entrega"} con los siguientes datos:`,
    ``,
    `Material: ${etiquetaPedido(pedido)}`,
    `Detalle (pulgadas / observaciones): ${envio.detalleTransporte || "(sin especificar)"}`,
    `Tipo de bulto: ${tipoBultoLabel}`,
    `Dimensiones: ${dimensiones}`,
    `Peso: ${peso}`,
    ``,
    `Día de recogida: ${fecha}`,
    `Horario: ${franja}`,
    ``,
    `Dirección de recogida: ${envio.direccionRecogida || "(sin especificar)"} (${envio.ciudadRecogida || envio.origen})`,
    `Dirección de entrega: ${envio.direccionEntrega || "(sin especificar)"} (${envio.ciudadEntrega || envio.destino})`,
    ``,
    `(Solicitud para ${TRANSPORTISTA_LABELS[envio.transportista as Transportista] || envio.transportista})`,
    ``,
    envio.notas ? `Notas: ${envio.notas}` : null,
    envio.notas ? `` : null,
    `Un saludo,`,
    `Admira`,
    ``,
    `---`,
    `Enviado automáticamente por Admira Trace · Movimiento #${envio.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { subject, text };
}
