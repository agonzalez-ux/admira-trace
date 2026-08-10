import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { asegurarCoordsEstanco, asegurarCoordsTecnico, distanciaKm } from "@/lib/geo";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({
    where: { id: params.id },
    include: { estanco: true },
  });
  if (!incidencia) return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });

  const tecnicos = await prisma.user.findMany({
    where: { role: "TECNICO", active: true },
    select: { id: true, name: true, zona: true, direccion: true, lat: true, lon: true },
    orderBy: { name: "asc" },
  });

  // Sin estanco vinculado no hay punto de referencia: se devuelven los técnicos
  // sin distancia en vez de inventar un número.
  const coordsIncidencia = incidencia.estancoId ? await asegurarCoordsEstanco(incidencia.estancoId) : null;

  if (!coordsIncidencia) {
    return NextResponse.json({
      tecnicos: tecnicos.map((t) => ({ id: t.id, name: t.name, zona: t.zona, distanciaKm: null })),
      motivoSinDistancia: incidencia.estancoId
        ? "No se han podido obtener las coordenadas del estanco."
        : "No vinculada a ningún estanco: ábrela y vincúlalo a mano para ver las distancias.",
    });
  }

  const conDistancia = [];
  for (const t of tecnicos) {
    const coordsT = t.lat !== null && t.lon !== null ? { lat: t.lat, lon: t.lon } : await asegurarCoordsTecnico(t.id);
    conDistancia.push({
      id: t.id,
      name: t.name,
      zona: t.zona,
      distanciaKm: coordsT ? Math.round(distanciaKm(coordsIncidencia, coordsT)) : null,
    });
  }

  // Los que tienen distancia conocida primero, de más cerca a más lejos.
  conDistancia.sort((a, b) => {
    if (a.distanciaKm === null) return 1;
    if (b.distanciaKm === null) return -1;
    return a.distanciaKm - b.distanciaKm;
  });

  return NextResponse.json({ tecnicos: conDistancia, motivoSinDistancia: null });
}
