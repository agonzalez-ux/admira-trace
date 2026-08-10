import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { etiquetaTipo, etiquetaOrigenIncidencia } from "@/lib/materialLabel";
import {
  ESTADO_MATERIAL_LABELS,
  ESTADO_ENVIO_LABELS,
  ESTADO_INCIDENCIA_LABELS,
  TIPO_MATERIAL_LABELS,
  TIPO_INCIDENCIA_LABELS,
} from "@/lib/constants";

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2952E3" } };
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

async function buildMateriales(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Material");
  sheet.columns = [
    { header: "Código de barras", key: "codigoBarras", width: 20 },
    { header: "Tipo", key: "tipo", width: 16 },
    { header: "Nombre", key: "nombre", width: 28 },
    { header: "Nº serie", key: "numeroSerie", width: 18 },
    { header: "Estado", key: "estado", width: 22 },
    { header: "Técnico actual", key: "tecnico", width: 22 },
    { header: "Zona", key: "zona", width: 16 },
    { header: "Ubicación", key: "ubicacion", width: 20 },
    { header: "Creado", key: "createdAt", width: 20 },
    { header: "Actualizado", key: "updatedAt", width: 20 },
  ];
  const materiales = await prisma.material.findMany({ include: { tecnico: true }, orderBy: { createdAt: "desc" } });
  for (const m of materiales) {
    sheet.addRow({
      codigoBarras: m.codigoBarras,
      tipo: etiquetaTipo(m),
      nombre: m.nombre,
      numeroSerie: m.numeroSerie || "",
      estado: ESTADO_MATERIAL_LABELS[m.estado as keyof typeof ESTADO_MATERIAL_LABELS] || m.estado,
      tecnico: m.tecnico?.name || "",
      zona: m.tecnico?.zona || "",
      ubicacion: m.ubicacion || "",
      createdAt: m.createdAt.toLocaleString("es-ES"),
      updatedAt: m.updatedAt.toLocaleString("es-ES"),
    });
  }
  styleHeader(sheet);
}

async function buildEnvios(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Envíos y recogidas");
  sheet.columns = [
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Transportista", key: "transportista", width: 14 },
    { header: "Origen", key: "origen", width: 20 },
    { header: "Destino", key: "destino", width: 20 },
    { header: "Técnico", key: "tecnico", width: 20 },
    { header: "Estado", key: "estado", width: 26 },
    { header: "Recurrente", key: "recurrente", width: 12 },
    { header: "Nº material", key: "numMaterial", width: 12 },
    { header: "Códigos de barras", key: "codigos", width: 40 },
    { header: "Creado por", key: "creadoPor", width: 18 },
    { header: "Fecha creación", key: "fechaCreacion", width: 20 },
    { header: "Fecha enviado", key: "fechaEnviado", width: 20 },
    { header: "Fecha recibido", key: "fechaRecibido", width: 20 },
    { header: "Notas", key: "notas", width: 30 },
  ];
  const envios = await prisma.envio.findMany({
    include: { tecnico: true, creadoPor: true, items: { include: { material: true } } },
    orderBy: { fechaCreacion: "desc" },
  });
  for (const e of envios) {
    sheet.addRow({
      tipo: e.tipo === "ENVIO" ? "Envío" : "Recogida",
      transportista: e.transportista,
      origen: e.origen,
      destino: e.destino,
      tecnico: e.tecnico?.name || "",
      estado: ESTADO_ENVIO_LABELS[e.estado as keyof typeof ESTADO_ENVIO_LABELS] || e.estado,
      recurrente: e.esRecurrente ? "Sí" : "No",
      numMaterial: e.items.length,
      codigos: e.items.map((i) => i.material.codigoBarras).join(", "),
      creadoPor: e.creadoPor?.name || "",
      fechaCreacion: e.fechaCreacion.toLocaleString("es-ES"),
      fechaEnviado: e.fechaEnviado ? e.fechaEnviado.toLocaleString("es-ES") : "",
      fechaRecibido: e.fechaRecibido ? e.fechaRecibido.toLocaleString("es-ES") : "",
      notas: e.notas || "",
    });
  }
  styleHeader(sheet);
}

async function buildIncidencias(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Incidencias");
  sheet.columns = [
    { header: "Origen", key: "origen", width: 10 },
    { header: "Ticket desk", key: "ticket", width: 16 },
    { header: "Título", key: "titulo", width: 30 },
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "Cliente", key: "cliente", width: 22 },
    { header: "Dirección", key: "direccion", width: 26 },
    { header: "Técnico", key: "tecnico", width: 20 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Material instalado", key: "materiales", width: 34 },
    { header: "Nº fotos evidencia", key: "numFotos", width: 14 },
    { header: "Asignada", key: "fechaAsignacion", width: 20 },
    { header: "En camino", key: "fechaEnCamino", width: 20 },
    { header: "Resuelta", key: "fechaResuelta", width: 20 },
  ];
  const incidencias = await prisma.incidencia.findMany({
    include: { tecnico: true, fotos: true, materialesUsados: { include: { material: true } } },
    orderBy: { fechaImportada: "desc" },
  });
  for (const i of incidencias) {
    sheet.addRow({
      origen: etiquetaOrigenIncidencia(i.origen),
      ticket: i.ticketExternoId || "",
      titulo: i.titulo,
      tipo: TIPO_INCIDENCIA_LABELS[i.tipo as keyof typeof TIPO_INCIDENCIA_LABELS] || i.tipo,
      cliente: i.cliente || "",
      direccion: i.direccion || "",
      tecnico: i.tecnico?.name || "(sin asignar)",
      estado: ESTADO_INCIDENCIA_LABELS[i.estado as keyof typeof ESTADO_INCIDENCIA_LABELS] || i.estado,
      materiales: i.materialesUsados.map((m) => m.material.codigoBarras).join(", "),
      numFotos: i.fotos.length,
      fechaAsignacion: i.fechaAsignacion ? i.fechaAsignacion.toLocaleString("es-ES") : "",
      fechaEnCamino: i.fechaEnCamino ? i.fechaEnCamino.toLocaleString("es-ES") : "",
      fechaResuelta: i.fechaResuelta ? i.fechaResuelta.toLocaleString("es-ES") : "",
    });
  }
  styleHeader(sheet);
}

async function buildTecnicos(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Técnicos");
  sheet.columns = [
    { header: "Nombre", key: "name", width: 28 },
    { header: "Usuario", key: "username", width: 20 },
    { header: "Email", key: "email", width: 30 },
    { header: "Zona", key: "zona", width: 16 },
    { header: "Dirección", key: "direccion", width: 34 },
    { header: "Teléfono", key: "phone", width: 18 },
    { header: "Persona de contacto", key: "personaContacto", width: 26 },
    { header: "Horario", key: "horario", width: 26 },
    { header: "Cobertura sin coste", key: "radioCobertura", width: 28 },
    { header: "Coste km", key: "costeKm", width: 14 },
    { header: "Material asignado", key: "numMaterial", width: 16 },
    { header: "Incidencias activas", key: "numIncidencias", width: 18 },
    { header: "Alta", key: "createdAt", width: 20 },
  ];
  const tecnicos = await prisma.user.findMany({
    where: { role: "TECNICO" },
    include: {
      materiales: true,
      incidenciasAsig: { where: { estado: { not: "RESUELTA" } } },
    },
    orderBy: { name: "asc" },
  });
  for (const t of tecnicos) {
    sheet.addRow({
      name: t.name,
      username: t.username,
      email: t.email || "",
      zona: t.zona || "",
      direccion: t.direccion || "",
      phone: t.phone || "",
      personaContacto: t.personaContacto || "",
      horario: t.horario || "",
      radioCobertura: t.radioCobertura || "",
      costeKm: t.costeKm || "",
      numMaterial: t.materiales.length,
      numIncidencias: t.incidenciasAsig.length,
      createdAt: t.createdAt.toLocaleString("es-ES"),
    });
  }
  styleHeader(sheet);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table") || "all";

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Admira Trace";
  workbook.created = new Date();

  if (table === "materiales" || table === "all") await buildMateriales(workbook);
  if (session.role === "ADMIRA" && (table === "envios" || table === "all")) await buildEnvios(workbook);
  if (table === "envios" && session.role === "FDM") await buildEnvios(workbook);
  if (session.role === "ADMIRA" && (table === "incidencias" || table === "all")) await buildIncidencias(workbook);
  if (session.role === "ADMIRA" && (table === "tecnicos" || table === "all")) await buildTecnicos(workbook);

  if (workbook.worksheets.length === 0) {
    return NextResponse.json({ error: "No autorizado para exportar esta tabla." }, { status: 403 });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="admira-trace-${table}-${Date.now()}.xlsx"`,
    },
  });
}
