import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { esProyectoValido } from "@/lib/proyectos";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tecnicoId = searchParams.get("tecnicoId");
  const estado = searchParams.get("estado");
  const proyecto = searchParams.get("proyecto");

  const where: any = {};
  if (session.role === "TECNICO") {
    where.tecnicoId = session.userId;
  } else if (tecnicoId) {
    where.tecnicoId = tecnicoId;
  }
  if (estado) where.estado = estado;
  // Selector de proyecto del portal Admira: un técnico sigue viendo todo su
  // propio material sin filtrar, ya que puede llevar piezas de varios
  // proyectos encima a la vez.
  if (session.role !== "TECNICO" && esProyectoValido(proyecto)) where.proyecto = proyecto;

  const materiales = await prisma.material.findMany({
    where,
    include: { tecnico: { select: { id: true, name: true, zona: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ materiales });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { numeroSerie, tipo, tipoPersonalizado, nombre, descripcion, imei, proyecto } = body || {};

  if (!numeroSerie || !tipo || !nombre) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }
  if (!esProyectoValido(proyecto)) {
    return NextResponse.json({ error: "Indica a qué proyecto pertenece este material." }, { status: 400 });
  }
  if (tipo === "OTRO" && !String(tipoPersonalizado || "").trim()) {
    return NextResponse.json({ error: "Indica qué tipo de material es." }, { status: 400 });
  }

  const existing = await prisma.material.findUnique({ where: { numeroSerie } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un material con ese número de serie." }, { status: 409 });
  }

  // Cada rol da de alta el material en su propio almacén: FDM en el suyo,
  // Admira en el de Admira.
  const estadoInicial = session.role === "ADMIRA" ? "EN_ADMIRA" : "EN_FDM";
  const almacen = session.role === "ADMIRA" ? "Admira" : "FDM";

  const material = await prisma.material.create({
    data: {
      numeroSerie,
      tipo,
      tipoPersonalizado: tipo === "OTRO" ? String(tipoPersonalizado).trim() : null,
      nombre,
      descripcion: descripcion || null,
      imei: tipo === "ROUTER" ? String(imei || "").trim() || null : null,
      proyecto,
      estado: estadoInicial,
      ubicacion: `Almacén ${almacen}`,
    },
  });

  await prisma.materialEvento.create({
    data: {
      materialId: material.id,
      tipo: "ALTA",
      usuarioId: session.userId,
      notas: `Alta de material en almacén ${almacen}`,
    },
  });

  await syncToSheets("materiales");

  return NextResponse.json({ material });
}
