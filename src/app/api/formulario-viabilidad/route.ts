import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { hashViabilidadToken } from "@/lib/viabilidad";
import { UPLOADS_DIR } from "@/lib/uploads";
import { CLOUDINARY_CONFIGURADO, subirFotoCloudinary } from "@/lib/cloudinary";
import { syncToSheets } from "@/lib/googleSheets";
import { actualizarFilaViabilidadEnExcel } from "@/lib/viabilidadExcel";
import { notificarEquipoAdmira } from "@/lib/notificaciones";

/**
 * Sin sesión: es un formulario público para el comercial de un estanco, que
 * no tiene cuenta en la app. La autorización es solo por el token del
 * enlace (mismo patrón que /api/auth/restablecer).
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ valido: false, error: "Falta el token." }, { status: 400 });

  const registro = await prisma.viabilidadToken.findUnique({
    where: { tokenHash: hashViabilidadToken(token) },
    include: { incidencia: { include: { estanco: true } } },
  });

  if (!registro || registro.usadoAt || registro.expiraAt < new Date()) {
    return NextResponse.json({ valido: false, error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }

  return NextResponse.json({
    valido: true,
    estancoNombre: registro.incidencia.estanco?.nombre || registro.incidencia.cliente || "",
    direccion: registro.incidencia.estanco?.direccion || registro.incidencia.direccion || "",
    materialSolicitado: registro.incidencia.titulo,
  });
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = String(formData.get("token") || "");
  if (!token) return NextResponse.json({ error: "Falta el token." }, { status: 400 });

  const registro = await prisma.viabilidadToken.findUnique({
    where: { tokenHash: hashViabilidadToken(token) },
    include: { incidencia: true },
  });
  if (!registro || registro.usadoAt || registro.expiraAt < new Date()) {
    return NextResponse.json({ error: "El enlace no es válido o ha caducado." }, { status: 400 });
  }

  const materialConfirmado = formData.get("materialConfirmado") === "true";
  const materialCorreccion = String(formData.get("materialCorreccion") || "") || null;
  const tipoUbicacion = String(formData.get("tipoUbicacion") || "");
  const puntosElectricosCercanos = formData.get("puntosElectricosCercanos") === "true";
  const puntosElectricosComentario = String(formData.get("puntosElectricosComentario") || "") || null;
  const sePuedeTaladrar = formData.get("sePuedeTaladrar") === "true";
  const comentarios = String(formData.get("comentarios") || "") || null;
  const respondidoPorNombre = String(formData.get("respondidoPorNombre") || "") || null;

  if (!["HUECO", "PARED"].includes(tipoUbicacion)) {
    return NextResponse.json({ error: "Indica si es un hueco o una pared." }, { status: 400 });
  }

  const numOrNull = (v: FormDataEntryValue | null) => (v ? Number(v) || null : null);
  const medidasAncho = tipoUbicacion === "HUECO" ? numOrNull(formData.get("medidasAncho")) : null;
  const medidasAlto = tipoUbicacion === "HUECO" ? numOrNull(formData.get("medidasAlto")) : null;
  const medidasFondo = tipoUbicacion === "HUECO" ? numOrNull(formData.get("medidasFondo")) : null;

  const incidenciaId = registro.incidenciaId;

  await prisma.viabilidadRespuesta.upsert({
    where: { incidenciaId },
    create: {
      incidenciaId,
      materialConfirmado,
      materialCorreccion,
      tipoUbicacion,
      medidasAncho,
      medidasAlto,
      medidasFondo,
      puntosElectricosCercanos,
      puntosElectricosComentario,
      sePuedeTaladrar,
      comentarios,
      respondidoPorNombre,
    },
    update: {
      materialConfirmado,
      materialCorreccion,
      tipoUbicacion,
      medidasAncho,
      medidasAlto,
      medidasFondo,
      puntosElectricosCercanos,
      puntosElectricosComentario,
      sePuedeTaladrar,
      comentarios,
      respondidoPorNombre,
      respondidoEn: new Date(),
    },
  });

  const fotos = formData.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of fotos) {
    const buffer = Buffer.from(await file.arrayBuffer());
    let url: string;
    if (CLOUDINARY_CONFIGURADO) {
      url = await subirFotoCloudinary(buffer, `viabilidad/${incidenciaId}`);
    } else {
      const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const dir = path.join(UPLOADS_DIR, "viabilidad", incidenciaId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), buffer);
      url = `/api/uploads/viabilidad/${incidenciaId}/${fileName}`;
    }
    await prisma.viabilidadFoto.create({ data: { incidenciaId, url } });
  }

  await prisma.viabilidadToken.update({ where: { id: registro.id }, data: { usadoAt: new Date() } });

  const incidenciaActualizada = await prisma.incidencia.update({
    where: { id: incidenciaId },
    data: { viabilidadEstado: "RESPONDIDO" },
  });

  // No bloqueante: si el Excel de origen no está disponible o falla la
  // escritura, la respuesta ya ha quedado guardada en BD de todas formas.
  if (incidenciaActualizada.viabilidadExcelFileId && incidenciaActualizada.viabilidadExcelFila) {
    actualizarFilaViabilidadEnExcel(incidenciaActualizada.viabilidadExcelFileId, incidenciaActualizada.viabilidadExcelFila, {
      materialConfirmado,
      materialCorreccion,
      tipoUbicacion,
      medidas:
        tipoUbicacion === "HUECO" && (medidasAncho || medidasAlto || medidasFondo)
          ? `${medidasAncho ?? "?"} x ${medidasAlto ?? "?"} x ${medidasFondo ?? "?"} cm`
          : null,
      puntosElectricosCercanos,
      puntosElectricosComentario,
      sePuedeTaladrar,
      comentarios,
      respondidoPorNombre,
      fechaRespuesta: new Date(),
      estadoViabilidad: "Respondido — pendiente de revisión",
    }).catch((err) => console.error("[formulario-viabilidad] Error actualizando el Excel de origen:", err));
  }

  await syncToSheets(["incidencias", "censo"]).catch((err) =>
    console.error("[formulario-viabilidad] Error sincronizando Sheets:", err)
  );

  await notificarEquipoAdmira({
    tipo: "VIABILIDAD_RESPONDIDA",
    titulo: "Viabilidad de instalación respondida",
    mensaje: `${incidenciaActualizada.titulo} — pendiente de revisar y confirmar`,
    entidadTipo: "incidencia",
    entidadId: incidenciaId,
  });

  return NextResponse.json({ ok: true });
}
