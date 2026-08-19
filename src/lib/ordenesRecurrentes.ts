import { prisma } from "./prisma";
import { syncToSheets } from "./googleSheets";

export type MaterialConfigItem = { tipo: string; cantidad: number };

export function parseMaterialConfig(json: string): MaterialConfigItem[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i) => i && typeof i.tipo === "string" && Number(i.cantidad) > 0);
  } catch {
    return [];
  }
}

export function calcularProximaEjecucion(desde: Date, frecuenciaDias: number): Date {
  const proxima = new Date(desde);
  proxima.setDate(proxima.getDate() + frecuenciaDias);
  return proxima;
}

/**
 * Ejecuta las órdenes recurrentes cuya fecha ya ha llegado: crea un envío por
 * cada una, cogiendo material disponible en almacén (FDM o Admira) según la
 * configuración de tipos/cantidades.
 *
 * Si no hay stock suficiente de un tipo, se envía lo que haya y se anota en las
 * notas del envío — nunca se inventa material que no existe.
 */
export async function ejecutarOrdenesRecurrentesPendientes(): Promise<{ generados: number; detalles: string[] }> {
  const ahora = new Date();
  const pendientes = await prisma.ordenRecurrente.findMany({
    where: { activa: true, proximaEjecucion: { lte: ahora } },
    include: { tecnico: true },
  });

  const detalles: string[] = [];
  let generados = 0;

  for (const orden of pendientes) {
    const config = parseMaterialConfig(orden.materialConfig);
    if (config.length === 0) {
      detalles.push(`Orden ${orden.id}: configuración de material vacía, se salta.`);
      await prisma.ordenRecurrente.update({
        where: { id: orden.id },
        data: { proximaEjecucion: calcularProximaEjecucion(ahora, orden.frecuenciaDias) },
      });
      continue;
    }

    const materialIds: string[] = [];
    const avisos: string[] = [];

    const estadoAlmacen = orden.almacen === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM";

    for (const item of config) {
      const disponibles = await prisma.material.findMany({
        where: { tipo: item.tipo, estado: estadoAlmacen },
        take: item.cantidad,
        orderBy: { createdAt: "asc" },
      });
      materialIds.push(...disponibles.map((m) => m.id));
      if (disponibles.length < item.cantidad) {
        avisos.push(`${item.tipo}: pedidas ${item.cantidad}, disponibles ${disponibles.length}`);
      }
    }

    if (materialIds.length === 0) {
      detalles.push(`Orden ${orden.id} (${orden.tecnico.name}): sin stock disponible, no se genera envío.`);
      await prisma.ordenRecurrente.update({
        where: { id: orden.id },
        data: { ultimaEjecucion: ahora, proximaEjecucion: calcularProximaEjecucion(ahora, orden.frecuenciaDias) },
      });
      continue;
    }

    const notasPartes = ["Envío generado automáticamente por orden recurrente."];
    if (orden.notas) notasPartes.push(orden.notas);
    if (avisos.length > 0) notasPartes.push(`Stock insuficiente — ${avisos.join("; ")}`);

    await prisma.envio.create({
      data: {
        tipo: "ENVIO",
        transportista: orden.transportista,
        origen: `Almacén ${orden.almacen === "ADMIRA" ? "Admira" : "FDM"}`,
        destino: orden.tecnico.name,
        almacen: orden.almacen,
        tecnicoId: orden.tecnicoId,
        esRecurrente: true,
        ordenRecurrenteId: orden.id,
        notas: notasPartes.join(" · "),
        creadoPorId: orden.creadoPorId,
        items: { create: materialIds.map((materialId) => ({ materialId })) },
      },
    });

    await prisma.ordenRecurrente.update({
      where: { id: orden.id },
      data: { ultimaEjecucion: ahora, proximaEjecucion: calcularProximaEjecucion(ahora, orden.frecuenciaDias) },
    });

    generados += 1;
    detalles.push(`Orden ${orden.id} (${orden.tecnico.name}): envío creado con ${materialIds.length} piezas.`);
  }

  if (generados > 0) {
    await syncToSheets(["envios", "materiales"]);
  }

  return { generados, detalles };
}
