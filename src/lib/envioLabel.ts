import { TIPO_MATERIAL_LABELS, TipoMaterial } from "./constants";

export type PedidoItem = { tipo: string; cantidad: number };

/** Parsea el JSON de `Envio.pedido` / `OrdenRecurrente.materialConfig`. Nunca lanza. */
export function parsePedido(json: string | null | undefined): PedidoItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i) => i && typeof i.tipo === "string" && Number(i.cantidad) > 0);
  } catch {
    return [];
  }
}

export function etiquetaPedido(pedido: PedidoItem[]): string {
  return pedido
    .map((p) => `${p.cantidad} ${TIPO_MATERIAL_LABELS[p.tipo as TipoMaterial] || p.tipo}`)
    .join(", ");
}

/**
 * El formulario de creación presenta un único desplegable "Tipo de
 * movimiento" con las combinaciones posibles, pero por debajo se sigue
 * guardando como (tipo, almacen) — esto evita tocar toda la lógica de
 * escaneo, que ya sabía razonar en esos términos.
 */
export const TIPOS_MOVIMIENTO = [
  {
    id: "ENVIO_FDM",
    label: "Envío (Almacén FDM → Técnico)",
    tipo: "ENVIO" as const,
    almacen: "FDM" as const,
    requiereTecnico: true,
  },
  {
    id: "RECOGIDA_FDM",
    label: "Recogida (Técnico → Almacén FDM)",
    tipo: "RECOGIDA" as const,
    almacen: "FDM" as const,
    requiereTecnico: true,
  },
  {
    id: "ENVIO_ADMIRA",
    label: "Envío (Almacén Admira → Técnico)",
    tipo: "ENVIO" as const,
    almacen: "ADMIRA" as const,
    requiereTecnico: true,
  },
  {
    id: "RECOGIDA_ADMIRA",
    label: "Recogida (Técnico → Almacén Admira)",
    tipo: "RECOGIDA" as const,
    almacen: "ADMIRA" as const,
    requiereTecnico: true,
  },
  {
    id: "TRANSFERENCIA_FDM_ADMIRA",
    label: "Transferencia (Almacén FDM → Almacén Admira)",
    tipo: "TRANSFERENCIA" as const,
    almacen: "FDM" as const,
    requiereTecnico: false,
  },
  {
    id: "TRANSFERENCIA_ADMIRA_FDM",
    label: "Transferencia (Almacén Admira → Almacén FDM)",
    tipo: "TRANSFERENCIA" as const,
    almacen: "ADMIRA" as const,
    requiereTecnico: false,
  },
] as const;

export type TipoMovimientoId = (typeof TIPOS_MOVIMIENTO)[number]["id"];

export function nombreAlmacen(almacen: "FDM" | "ADMIRA"): string {
  return `Almacén ${almacen === "ADMIRA" ? "Admira" : "FDM"}`;
}

/** El almacén "de enfrente" en una transferencia — solo hay dos, así que es el otro. */
export function almacenOpuesto(almacen: "FDM" | "ADMIRA"): "FDM" | "ADMIRA" {
  return almacen === "ADMIRA" ? "FDM" : "ADMIRA";
}

/**
 * Quién tiene que escanear en cada extremo de un envío/recogida/transferencia
 * ya creado — se usa tanto en el backend (autorización) como en el tablero
 * (para decidir a quién mostrarle el botón de escanear).
 */
export function origenRolFor(envio: { tipo: string; almacen: string }): string {
  return envio.tipo === "RECOGIDA" ? "TECNICO" : envio.almacen;
}

export function destinoRolFor(envio: { tipo: string; almacen: string }): string {
  if (envio.tipo === "RECOGIDA") return envio.almacen;
  if (envio.tipo === "ENVIO") return "TECNICO";
  return almacenOpuesto(envio.almacen as "FDM" | "ADMIRA");
}

/** Etiqueta legible del tipo de movimiento de un envío ya existente (para el tablero). */
export function etiquetaTipoMovimiento(envio: { tipo: string; almacen: string }): string {
  const almacenNombre = nombreAlmacen(envio.almacen as "FDM" | "ADMIRA");
  if (envio.tipo === "ENVIO") return `Envío · ${almacenNombre} → Técnico`;
  if (envio.tipo === "RECOGIDA") return `Recogida · Técnico → ${almacenNombre}`;
  return `Transferencia · ${almacenNombre} → ${nombreAlmacen(almacenOpuesto(envio.almacen as "FDM" | "ADMIRA"))}`;
}
