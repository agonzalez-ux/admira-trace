import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { asegurarCoordsEstanco, distanciaKm, rellenarCoordsTecnicosEnSegundoPlano } from "@/lib/geo";

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

  // OJO: NO se geocodifica aquí a los técnicos que no tengan coordenadas.
  // Nominatim solo admite 1 petición/segundo, así que con muchos técnicos sin
  // coordenadas la petición se quedaría colgada varios minutos. Se calcula la
  // distancia solo con lo que ya está guardado (rápido) y, en segundo plano
  // sin bloquear la respuesta, se van geocodificando los que faltan para que
  // las próximas veces salgan ya con distancia.
  const conDistancia = tecnicos.map((t) => ({
    id: t.id,
    name: t.name,
    zona: t.zona,
    distanciaKm: t.lat !== null && t.lon !== null ? Math.round(distanciaKm(coordsIncidencia, { lat: t.lat, lon: t.lon })) : null,
  }));

  rellenarCoordsTecnicosEnSegundoPlano(tecnicos.filter((t) => t.lat === null || t.lon === null).map((t) => t.id));

  // Los que tienen distancia conocida primero, de más cerca a más lejos.
  conDistancia.sort((a, b) => {
    if (a.distanciaKm === null) return 1;
    if (b.distanciaKm === null) return -1;
    return a.distanciaKm - b.distanciaKm;
  });

  return NextResponse.json({ tecnicos: conDistancia, motivoSinDistancia: null });
}
