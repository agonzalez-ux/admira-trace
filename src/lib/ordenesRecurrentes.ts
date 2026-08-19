import { prisma } from "./prisma";
import { syncToSheets } from "./googleSheets";
import { parsePedido, nombreAlmacen } from "./envioLabel";

export function calcularProximaEjecucion(desde: Date, frecuenciaDias: number): Date {
  const proxima = new Date(desde);
  proxima.setDate(proxima.getDate() + frecuenciaDias);
  return proxima;
}

/**
 * Ejecuta las órdenes recurrentes cuya fecha ya ha llegado: crea un envío por
 * cada una, con el mismo pedido por categorías que la orden. No se preselecciona
 * ninguna pieza concreta — igual que un envío normal, el almacén escaneará las
 * unidades reales al prepararlo (si no hay stock suficiente de algo, lo
 * descubrirá ahí y podrá cerrar el envío con lo que haya, avisando a Admira).
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
    const pedido = parsePedido(orden.materialConfig);
    if (pedido.length === 0) {
      detalles.push(`Orden ${orden.id}: configuración de material vacía, se salta.`);
      await prisma.ordenRecurrente.update({
        where: { id: orden.id },
        data: { proximaEjecucion: calcularProximaEjecucion(ahora, orden.frecuenciaDias) },
      });
      continue;
    }

    const notasPartes = ["Envío generado automáticamente por orden recurrente."];
    if (orden.notas) notasPartes.push(orden.notas);

    await prisma.envio.create({
      data: {
        tipo: "ENVIO",
        transportista: orden.transportista,
        origen: nombreAlmacen(orden.almacen as "FDM" | "ADMIRA"),
        destino: orden.tecnico.name,
        almacen: orden.almacen,
        tecnicoId: orden.tecnicoId,
        pedido: JSON.stringify(pedido),
        esRecurrente: true,
        ordenRecurrenteId: orden.id,
        notas: notasPartes.join(" · "),
        creadoPorId: orden.creadoPorId,
      },
    });

    await prisma.ordenRecurrente.update({
      where: { id: orden.id },
      data: { ultimaEjecucion: ahora, proximaEjecucion: calcularProximaEjecucion(ahora, orden.frecuenciaDias) },
    });

    generados += 1;
    detalles.push(`Orden ${orden.id} (${orden.tecnico.name}): envío creado.`);
  }

  if (generados > 0) {
    await syncToSheets(["envios"]);
  }

  return { generados, detalles };
}
