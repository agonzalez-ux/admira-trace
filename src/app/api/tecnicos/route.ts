import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { esProyectoValido } from "@/lib/proyectos";

const SELECT_TECNICO = {
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
} as const;

function aResultado(t: any) {
  return {
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
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role === "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Solo el listado de la pestaña "Técnicos" del portal Admira pasa este
  // parámetro (para verlos filtrados por el proyecto seleccionado); el resto
  // de sitios donde se usa este endpoint (selectores de técnico al asignar
  // una incidencia o crear un envío) lo llaman sin él a propósito — ahí hace
  // falta poder elegir cualquier técnico, tenga o no actividad previa en el
  // proyecto actual.
  const proyecto = req.nextUrl.searchParams.get("proyecto");
  const filtrarPorProyecto = esProyectoValido(proyecto);

  const where: any = { role: "TECNICO", active: true };
  if (filtrarPorProyecto) {
    // No hay un campo "proyecto" propio del técnico (puede atender varios) —
    // se considera "activo en el proyecto" si tiene alguna incidencia o
    // material de ese proyecto encima ahora mismo.
    where.OR = [{ materiales: { some: { proyecto } } }, { incidenciasAsig: { some: { proyecto } } }];
  }

  let tecnicos = await prisma.user.findMany({ where, select: SELECT_TECNICO, orderBy: { name: "asc" } });

  // Si el filtro deja la lista vacía (proyecto recién estrenado, sin ninguna
  // actividad todavía), se muestra el listado completo en vez de dejar a
  // Admira sin nadie a quien asignar el primer ticket de ese proyecto.
  let sinActividadEnProyecto = false;
  if (filtrarPorProyecto && tecnicos.length === 0) {
    sinActividadEnProyecto = true;
    tecnicos = await prisma.user.findMany({
      where: { role: "TECNICO", active: true },
      select: SELECT_TECNICO,
      orderBy: { name: "asc" },
    });
  }

  return NextResponse.json({ tecnicos: tecnicos.map(aResultado), sinActividadEnProyecto });
}
