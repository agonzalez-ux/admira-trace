import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { syncToSheets } from "@/lib/googleSheets";
import { syncDeskTickets } from "@/lib/desk";
import { crearNotificacion } from "@/lib/notificaciones";
import { syncHardwareDesconectado } from "@/lib/hardwareSync";
import { matchEstanco } from "@/lib/estancoMatch";
import { iniciarScheduler } from "@/lib/scheduler";

export async function GET() {
  // Arranca (una sola vez) la comprobación periódica de órdenes recurrentes.
  iniciarScheduler();

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  // Cada vez que Admira abre el listado, se refresca automáticamente con el desk
  // de tickets (tickets activos que requieren visita in situ de los proyectos Altadis)
  // y, como mucho cada 20 minutos, con el directorio de estancos — sin que nadie
  // tenga que darle a ningún botón.
  //
  // Antes se esperaba (await) a que terminaran estas sincronizaciones antes de
  // responder, lo que podía tardar 20-30s (7 proyectos del desk, cada uno con
  // varias páginas de peticiones) y hacía que la pestaña de Incidencias se
  // sintiera colgada en cada carga. Ahora se lanzan en segundo plano: la
  // página responde al instante con lo que ya hay en la base de datos, y la
  // sincronización sigue corriendo aparte (protegida por su propio límite de
  // 1 vez por minuto), así que en la siguiente carga ya estará al día.
  if (session.role === "ADMIRA") {
    syncDeskTickets().catch((err) => console.error("[desk-sync] Error sincronizando tickets del desk:", err));
    syncHardwareDesconectado().catch((err) =>
      console.error("[hardware-sync] Error sincronizando pantallas desconectadas:", err)
    );
    syncToSheets("estancos").catch((err) => console.error("[google-sheets] Error sincronizando estancos:", err));
  }

  const where: any = {};
  // Los técnicos solo ven sus propias incidencias activas: las resueltas no
  // les aportan nada en el día a día y solo añaden ruido a la lista.
  if (session.role === "TECNICO") {
    where.tecnicoId = session.userId;
    where.estado = { not: "RESUELTA" };
  }

  const incidencias = await prisma.incidencia.findMany({
    where,
    include: {
      tecnico: { select: { id: true, name: true, zona: true, phone: true } },
      creadoPor: { select: { name: true } },
      estanco: { select: { nombre: true, comercial: true, telefonoComercial: true, correoComercial: true } },
      fotos: true,
      materialesUsados: { include: { material: true } },
    },
    orderBy: { fechaImportada: "desc" },
  });

  return NextResponse.json({ incidencias });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "Solo Admira puede asignar incidencias." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { ticketExternoId, titulo, descripcion, tipo, cliente, direccion, tecnicoId } = body || {};

  if (!titulo || !tipo || !tecnicoId) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }

  const tecnico = await prisma.user.findUnique({ where: { id: tecnicoId } });
  if (!tecnico || tecnico.role !== "TECNICO") {
    return NextResponse.json({ error: "Técnico no válido." }, { status: 400 });
  }

  const match = await matchEstanco(`${cliente || ""} ${direccion || ""}`);

  const incidencia = await prisma.incidencia.create({
    data: {
      ticketExternoId: ticketExternoId || null,
      titulo,
      descripcion: descripcion || null,
      tipo,
      cliente: cliente || null,
      direccion: direccion || null,
      tecnicoId,
      estado: "ASIGNADA",
      fechaAsignacion: new Date(),
      creadoPorId: session.userId,
      estancoId: match?.estancoId || null,
      estancoMatchConfianza: match?.confianza || null,
    },
    include: { tecnico: true, estanco: true },
  });

  await syncToSheets(["incidencias", "tecnicos", "intervenciones", "censo"]);

  await crearNotificacion({
    userId: tecnicoId,
    tipo: "INCIDENCIA_ASIGNADA",
    titulo: "Nueva incidencia asignada",
    mensaje: incidencia.titulo,
    entidadTipo: "incidencia",
    entidadId: incidencia.id,
  });

  return NextResponse.json({ incidencia });
}
