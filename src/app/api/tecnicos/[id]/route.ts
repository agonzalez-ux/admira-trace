import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role === "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const tecnico = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      username: true,
      zona: true,
      direccion: true,
      phone: true,
      email: true,
      codigoPostal: true,
      personaContacto: true,
      horario: true,
      radioCobertura: true,
      costeKm: true,
      condiciones: true,
      createdAt: true,
    },
  });

  if (!tecnico) {
    return NextResponse.json({ error: "Técnico no encontrado." }, { status: 404 });
  }

  const materiales = await prisma.material.findMany({
    where: { tecnicoId: params.id, estado: "EN_TECNICO" },
    orderBy: { tipo: "asc" },
  });

  const incidenciasPendientes = await prisma.incidencia.findMany({
    where: { tecnicoId: params.id, estado: { not: "RESUELTA" } },
    orderBy: { fechaAsignacion: "desc" },
    include: {
      fotos: true,
      materialesUsados: { include: { material: true } },
      tecnico: { select: { id: true, name: true, zona: true, phone: true } },
      creadoPor: { select: { name: true } },
      estanco: { select: { nombre: true, comercial: true, correoComercial: true } },
    },
  });

  const historialIncidencias = await prisma.incidencia.findMany({
    where: { tecnicoId: params.id, estado: "RESUELTA" },
    orderBy: { fechaResuelta: "desc" },
    include: {
      fotos: true,
      materialesUsados: { include: { material: true } },
      tecnico: { select: { id: true, name: true, zona: true, phone: true } },
      creadoPor: { select: { name: true } },
      estanco: { select: { nombre: true, comercial: true, correoComercial: true } },
    },
  });

  // Envíos pendientes de recibir por este técnico (el "recibo de material" de su ficha).
  const enviosPendientes = await prisma.envio.findMany({
    where: { tecnicoId: params.id, estado: { not: "RECIBIDO" } },
    include: { items: { include: { material: true } } },
    orderBy: { fechaCreacion: "desc" },
  });

  const ordenesRecurrentes = await prisma.ordenRecurrente.findMany({
    where: { tecnicoId: params.id },
    include: { envios: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    tecnico,
    materiales,
    enviosPendientes,
    ordenesRecurrentes,
    incidenciasPendientes,
    historialIncidencias,
  });
}
