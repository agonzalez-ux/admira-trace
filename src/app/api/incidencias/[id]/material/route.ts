import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const incidencia = await prisma.incidencia.findUnique({ where: { id: params.id } });
  if (!incidencia || incidencia.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Incidencia no encontrada." }, { status: 404 });
  }
  // Defensa en profundidad: el tablero de asignación ya oculta las
  // instalaciones nuevas hasta que el comercial confirma viabilidad, pero
  // esta API no debe fiarse solo de eso — si algo la llamara igualmente
  // (otro cliente, una petición manual), no debe dejar instalar material en
  // una instalación aún no confirmada.
  if (incidencia.tipo === "INSTALACION_NUEVA" && incidencia.viabilidadEstado !== "VIABLE") {
    return NextResponse.json(
      { error: "Esta instalación todavía no está confirmada como viable." },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const numeroSerie = body?.numeroSerie?.trim();
  if (!numeroSerie) return NextResponse.json({ error: "Número de serie requerido." }, { status: 400 });

  const material = await prisma.material.findUnique({ where: { numeroSerie } });
  if (!material) return NextResponse.json({ error: "Material no encontrado." }, { status: 404 });
  if (material.tecnicoId !== session.userId) {
    return NextResponse.json({ error: "Ese material no está registrado en tu inventario." }, { status: 409 });
  }
  if (material.estado === "INSTALADO") {
    return NextResponse.json({ error: "Ese material ya figura como instalado." }, { status: 409 });
  }
  // Aviso (no bloqueo): si el material tiene proyecto asignado y no coincide
  // con el de la incidencia, probablemente sea un error de escaneo — pero no
  // se bloquea porque hay material histórico sin proyecto y casos legítimos
  // de traspaso entre proyectos.
  if (material.proyecto && incidencia.proyecto && material.proyecto !== incidencia.proyecto) {
    console.warn(
      `[incidencias/material] Material ${material.numeroSerie} (${material.proyecto}) instalado en incidencia de proyecto distinto (${incidencia.proyecto}).`
    );
  }

  const registro = await prisma.incidenciaMaterial.create({
    data: { incidenciaId: params.id, materialId: material.id },
    include: { material: true },
  });

  await prisma.material.update({
    where: { id: material.id },
    data: { estado: "INSTALADO", estancoInstaladoId: incidencia.estancoId },
  });

  await prisma.materialEvento.create({
    data: {
      materialId: material.id,
      tipo: "INSTALACION",
      usuarioId: session.userId,
      incidenciaId: params.id,
      notas: `Instalado en incidencia: ${incidencia.titulo}`,
    },
  });

  syncToSheets(["incidencias", "materiales", "intervenciones", "censo", "tecnicos"]).catch((err) =>
    console.error("[incidencias/material] Error sincronizando Sheets:", err)
  );

  return NextResponse.json({ registro });
}
