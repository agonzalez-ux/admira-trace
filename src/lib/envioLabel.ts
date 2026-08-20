import { TIPO_MATERIAL_LABELS, TIPOS_MATERIAL, TipoMaterial } from "./constants";

// `descripcion` solo se usa (y hace falta) cuando tipo es "OTRO": es lo que
// escribió Admira a mano para que el almacén sepa qué preparar exactamente
// (ej. "tablet", "regleta") — la pieza real que se acabe escaneando se sigue
// dando de alta como Material con tipo OTRO y su propio tipoPersonalizado,
// igual que siempre.
export type PedidoItem = { tipo: string; cantidad: number; descripcion?: string };

/** Parsea el JSON de `Envio.pedido` / `OrdenRecurrente.materialConfig`. Nunca lanza. */
export function parsePedido(json: string | null | undefined): PedidoItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.tipo === "string" && Number(i.cantidad) > 0)
      .map((i) => ({
        tipo: i.tipo,
        cantidad: Number(i.cantidad),
        ...(typeof i.descripcion === "string" && i.descripcion.trim() ? { descripcion: i.descripcion.trim() } : {}),
      }));
  } catch {
    return [];
  }
}

/**
 * Suma la cantidad pedida por tipo — puede haber varias líneas del mismo
 * tipo (típicamente varias líneas "Otro" con descripciones distintas, ej.
 * "2 tablet" + "3 regleta"), y a efectos de cupo/escaneo cuentan juntas: al
 * escanear no se distingue de cuál de las líneas es cada pieza concreta,
 * solo se comprueba que no se pase del total pedido de ese tipo.
 */
export function totalPorTipo(pedido: PedidoItem[]): Map<string, number> {
  const totales = new Map<string, number>();
  for (const p of pedido) totales.set(p.tipo, (totales.get(p.tipo) || 0) + p.cantidad);
  return totales;
}

export function etiquetaPedido(pedido: PedidoItem[]): string {
  return pedido
    .map((p) => {
      const base = `${p.cantidad} ${TIPO_MATERIAL_LABELS[p.tipo as TipoMaterial] || p.tipo}`;
      return p.descripcion ? `${base} (${p.descripcion})` : base;
    })
    .join(", ");
}

/**
 * Valida y limpia un pedido por categorías tal como llega del cliente (crear
 * envío, o editar una orden recurrente) — compartida entre ambos para que no
 * se pueda guardar en un sitio una categoría "Otro" sin descripción y en el
 * otro sí.
 */
export function validarPedido(pedido: unknown): { pedido: PedidoItem[] } | { error: string } {
  if (!Array.isArray(pedido) || pedido.length === 0) {
    return { error: "Indica al menos una categoría de material con cantidad mayor que 0." };
  }
  const limpio: PedidoItem[] = [];
  for (const item of pedido as any[]) {
    const tipo = item?.tipo;
    const cantidad = Number(item?.cantidad);
    if (!(TIPOS_MATERIAL as readonly string[]).includes(tipo)) {
      return { error: "Categoría de material no válida." };
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) continue; // se ignoran las categorías a 0
    if (tipo === "OTRO") {
      // Sin la descripción, "Otro" no le dice nada al almacén sobre qué preparar.
      const descripcion = String(item?.descripcion || "").trim();
      if (!descripcion) {
        return { error: 'Indica a mano qué material es exactamente en la categoría "Otro".' };
      }
      limpio.push({ tipo, cantidad, descripcion });
    } else {
      limpio.push({ tipo, cantidad });
    }
  }
  if (limpio.length === 0) {
    return { error: "Indica al menos una categoría de material con cantidad mayor que 0." };
  }
  return { pedido: limpio };
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
