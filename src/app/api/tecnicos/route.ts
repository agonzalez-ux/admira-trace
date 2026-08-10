import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || session.role === "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const tecnicos = await prisma.user.findMany({
    where: { role: "TECNICO", active: true },
    select: {
      id: true,
      name: true,
      zona: true,
      direccion: true,
      phone: true,
      email: true,
      username: true,
      personaContacto: true,
      radioCobertura: true,
      materiales: { where: { estado: "EN_TECNICO" }, select: { id: true } },
      incidenciasAsig: { where: { estado: { not: "RESUELTA" } }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  const result = tecnicos.map((t) => ({
    id: t.id,
    name: t.name,
    zona: t.zona,
    direccion: t.direccion,
    phone: t.phone,
    email: t.email,
    username: t.username,
    personaContacto: t.personaContacto,
    radioCobertura: t.radioCobertura,
    numMaterialDisponible: t.materiales.length,
    numIncidenciasPendientes: t.incidenciasAsig.length,
  }));

  return NextResponse.json({ tecnicos: result });
}
