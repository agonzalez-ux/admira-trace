/**
 * Notificaciones dirigidas a un usuario concreto: se guardan en BD (para la
 * campanita de la app) y, si tiene alguna suscripción push activa, también
 * se le envían como notificación del navegador/móvil.
 */
import { prisma } from "./prisma";
import { enviarPush } from "./push";

export type TipoNotificacion =
  | "ENVIO_CREADO"
  | "ENVIO_EN_CAMINO"
  | "ENVIO_RECIBIDO"
  | "INCIDENCIA_ASIGNADA"
  | "INCIDENCIA_EN_CAMINO"
  | "INCIDENCIA_RESUELTA"
  | "INCIDENCIAS_DESK_NUEVAS"
  | "LIMPIEZA_COMPLETADA";

type EntidadTipo = "envio" | "incidencia";

/**
 * Crea la notificación en BD y dispara el push en paralelo. Nunca lanza: un
 * fallo aquí (p. ej. push mal configurado) no debe romper la acción real
 * (crear el envío, asignar la incidencia...) que la desencadenó.
 */
export async function crearNotificacion({
  userId,
  tipo,
  titulo,
  mensaje,
  entidadTipo,
  entidadId,
}: {
  userId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: EntidadTipo;
  entidadId?: string;
}): Promise<void> {
  try {
    await prisma.notificacion.create({
      data: { userId, tipo, titulo, mensaje, entidadTipo, entidadId },
    });
  } catch (err) {
    console.error("[notificaciones] Error guardando notificación:", err);
  }

  try {
    await enviarPush(userId, { titulo, mensaje, url: urlEntidad(entidadTipo, entidadId) });
  } catch (err) {
    console.error("[notificaciones] Error enviando push:", err);
  }
}

/** Igual que crearNotificacion, pero para varios destinatarios a la vez (p. ej. todo el equipo Admira). */
export async function notificarVarios(
  userIds: string[],
  datos: Omit<Parameters<typeof crearNotificacion>[0], "userId">
): Promise<void> {
  await Promise.all(userIds.map((userId) => crearNotificacion({ ...datos, userId })));
}

/** Notifica a todo el equipo Admira activo (p. ej. tickets nuevos del desk sin asignar). */
export async function notificarEquipoAdmira(
  datos: Omit<Parameters<typeof crearNotificacion>[0], "userId">
): Promise<void> {
  const admiras = await prisma.user.findMany({
    where: { role: "ADMIRA", active: true },
    select: { id: true },
  });
  await notificarVarios(admiras.map((a) => a.id), datos);
}

function urlEntidad(entidadTipo?: EntidadTipo, entidadId?: string): string | undefined {
  if (!entidadTipo) return undefined;
  // Por ahora ambas entidades se ven desde la pestaña de Incidencias/Envíos
  // del dashboard de cada rol; no hay una ruta de detalle propia por id.
  if (entidadTipo === "envio") return "/";
  if (entidadTipo === "incidencia") return "/";
  return undefined;
}
