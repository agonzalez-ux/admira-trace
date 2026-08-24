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
    include: {
      tecnico: { select: { id: true, name: true, zona: true } },
      estancoInstalado: { select: { id: true, nombre: true, municipio: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // `estancoInstaladoId` se rellena directamente al instalar (ver POST
  // /api/incidencias/[id]/material) y con el backfill del histórico
  // (scripts/backfill-estanco-instalado.ts). Como red de seguridad, para lo
  // que aun así se quede sin ese campo (instalado antes de que existiera y
  // sin backfillear) se busca vía la incidencia donde se registró.
  const sinCampoDirecto = materiales.filter((m) => m.estado === "INSTALADO" && !m.estancoInstalado).map((m) => m.id);
  const estancoPorMaterial = new Map<string, { id: string; nombre: string; municipio: string | null }>();
  if (sinCampoDirecto.length > 0) {
    const usos = await prisma.incidenciaMaterial.findMany({
      where: { materialId: { in: sinCampoDirecto } },
      orderBy: { fecha: "desc" },
      include: { incidencia: { select: { estanco: { select: { id: true, nombre: true, municipio: true } } } } },
    });
    // Un material puede haberse instalado/desinstalado varias veces — con el
    // orden descendente, la primera vez que se ve cada material ya es la más
    // reciente, así que las siguientes se ignoran.
    for (const uso of usos) {
      if (estancoPorMaterial.has(uso.materialId) || !uso.incidencia.estanco) continue;
      estancoPorMaterial.set(uso.materialId, uso.incidencia.estanco);
    }
  }

  const resultado = materiales.map((m) => ({
    ...m,
    estancoInstalado: m.estancoInstalado || estancoPorMaterial.get(m.id) || null,
  }));

  return NextResponse.json({ materiales: resultado });
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
