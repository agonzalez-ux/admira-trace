import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { Rol } from "./constants";
import { iniciarScheduler } from "./scheduler";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");
const COOKIE_NAME = "admira_trace_session";

export type SessionPayload = {
  userId: string;
  username: string;
  name: string;
  role: Rol;
};

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  // Antes el temporizador de sincronización (desk + órdenes recurrentes) solo
  // arrancaba si alguien llegaba a cargar la pestaña de Incidencias — tras un
  // despliegue (el contenedor se reinicia, y con él este estado en memoria),
  // si nadie abría esa pestaña en concreto, el desk se quedaba sin
  // sincronizar hasta que alguien lo hiciera. getSession() se llama en
  // prácticamente cualquier petición autenticada de cualquier pestaña, así
  // que es un punto de arranque mucho más fiable — iniciarScheduler() ya es
  // idempotente (no hace nada si ya está en marcha), así que llamarlo aquí en
  // cada petición no tiene coste real.
  iniciarScheduler();

  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
