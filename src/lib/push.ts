/**
 * Notificaciones push del navegador (Web Push / VAPID).
 * Gratis, sin servicio de terceros: el propio navegador de cada persona
 * gestiona la entrega contra el "push service" de su proveedor (Google,
 * Mozilla, Apple...), usando las claves VAPID como identificación del
 * servidor de Admira Trace.
 */
import webpush from "web-push";
import { prisma } from "./prisma";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:soporte.altadis@admira.com";

export const PUSH_CONFIGURADO = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (PUSH_CONFIGURADO) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

export type PushPayload = {
  titulo: string;
  mensaje: string;
  url?: string;
};

/**
 * Envía una notificación push a TODAS las suscripciones activas de un
 * usuario (puede tener varias: el móvil, el ordenador...). Si una
 * suscripción ya no es válida (404/410: el usuario desinstaló, borró datos
 * del navegador, etc.), se borra de la base de datos en vez de reintentarla
 * en el futuro.
 */
export async function enviarPush(userId: string, payload: PushPayload): Promise<void> {
  if (!PUSH_CONFIGURADO) return;

  const suscripciones = await prisma.pushSubscription.findMany({ where: { userId } });
  if (suscripciones.length === 0) return;

  const cuerpo = JSON.stringify(payload);

  await Promise.all(
    suscripciones.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          cuerpo
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          // Suscripción caducada/inválida: se borra para no reintentar en vano.
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push] Error enviando notificación:", err?.message || err);
        }
      }
    })
  );
}
