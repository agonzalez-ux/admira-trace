import { redirect } from "next/navigation";
import { getSession, SessionPayload } from "./auth";
import { Rol } from "./constants";

export async function requireRole(role: Rol): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== role) {
    redirect("/");
  }
  return session;
}
