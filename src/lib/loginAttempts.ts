/**
 * Protección contra fuerza bruta en el login.
 * Cuenta intentos fallidos por combinación usuario+IP y bloquea temporalmente
 * tras varios fallos seguidos, para que no se puedan probar contraseñas sin límite.
 */

import { prisma } from "./prisma";

const MAX_INTENTOS = 3;
const BLOQUEO_MINUTOS = 15;

function claveDe(username: string, ip: string): string {
  return `${username.toLowerCase().trim()}:${ip}`;
}

/** Devuelve los minutos restantes de bloqueo, o `null` si no está bloqueado. */
export async function minutosBloqueadoRestantes(username: string, ip: string): Promise<number | null> {
  const clave = claveDe(username, ip);
  const registro = await prisma.loginAttempt.findUnique({ where: { clave } });

  if (!registro?.bloqueadoHasta) return null;
  if (registro.bloqueadoHasta.getTime() <= Date.now()) return null;

  return Math.ceil((registro.bloqueadoHasta.getTime() - Date.now()) / (60 * 1000));
}

/**
 * Registra un intento fallido. Al llegar a MAX_INTENTOS seguidos, bloquea
 * esa combinación usuario+IP durante BLOQUEO_MINUTOS.
 */
export async function registrarIntentoFallido(username: string, ip: string): Promise<void> {
  const clave = claveDe(username, ip);
  const existente = await prisma.loginAttempt.findUnique({ where: { clave } });

  const intentos = (existente?.intentos ?? 0) + 1;
  const bloqueadoHasta =
    intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MINUTOS * 60 * 1000) : existente?.bloqueadoHasta ?? null;

  await prisma.loginAttempt.upsert({
    where: { clave },
    create: { clave, intentos, bloqueadoHasta },
    update: { intentos, bloqueadoHasta },
  });
}

/** Limpia el contador tras un login correcto. */
export async function limpiarIntentos(username: string, ip: string): Promise<void> {
  const clave = claveDe(username, ip);
  await prisma.loginAttempt.deleteMany({ where: { clave } });
}

/** Saca la IP real de la request, teniendo en cuenta que Cloudflare Tunnel reenvía por proxy. */
export function obtenerIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || "desconocida";
}
