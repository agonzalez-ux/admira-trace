import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseExcelInstalaciones, mapearStatusAIncidenciaEstado } from "@/lib/excel-import";
import { syncToSheets } from "@/lib/googleSheets";
import { guardarExcelSemanalEnDrive } from "@/lib/viabilidadExcel";
import { solicitarViabilidadComercial } from "@/lib/viabilidad";

/**
 * POST /api/incidencias/importar-instalaciones
 * Importa instalaciones semanales desde el Excel LIBRO4.
 * Solo ADMIRA puede hacerlo.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "ADMIRA") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const archivo = formData.get("archivo") as File;

    if (!archivo) {
      return NextResponse.json({ error: "No se subió ningún archivo." }, { status: 400 });
    }

    if (!archivo.name.endsWith(".xlsx") && !archivo.name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Solo se aceptan archivos Excel (.xlsx, .xls)" },
        { status: 400 }
      );
    }

    console.log(`[incidencias/importar-instalaciones] Importando ${archivo.name}...`);

    // Parsear Excel
    const { filas, errores } = await parseExcelInstalaciones(archivo);

    if (filas.length === 0) {
      return NextResponse.json(
        {
          error: "No se encontraron filas de datos en el Excel",
          detalles: errores,
        },
        { status: 400 }
      );
    }

    // Se guarda el propio Excel en Drive (es el documento real que el equipo
    // ya revisa) con las columnas de viabilidad añadidas — así, conforme
    // vayan respondiendo los comerciales, se puede volver a abrir y rellenar
    // fila a fila. Si no hay carpeta de Drive configurada, sigue funcionando
    // igual, solo sin esta parte (queda registrado en consola).
    const excelBuffer = Buffer.from(await archivo.arrayBuffer());
    const excelFileId = await guardarExcelSemanalEnDrive(excelBuffer, archivo.name).catch((err) => {
      console.error("[importar-instalaciones] Error guardando el Excel en Drive:", err);
      return null;
    });

    let incidenciasCreadas = 0;
    let incidenciasActualizadas = 0;
    const erroresImporte: string[] = [];
    const instalacionesNuevasIds: string[] = [];

    for (const fila of filas) {
      try {
        // Validar que el COD HOST existe en estancos
        const estanco = await prisma.estanco.findUnique({
          where: { idEstanco: fila.codHost },
        });

        if (!estanco) {
          erroresImporte.push(
            `${fila.sr}: COD HOST ${fila.codHost} no encontrado en BD de estancos`
          );
          continue;
        }

        // Buscar si la incidencia ya existe por SR (ticketExternoId). No es un
        // campo único en el esquema, así que se busca con findFirst.
        const incidenciaExistente = await prisma.incidencia.findFirst({
          where: { ticketExternoId: fila.sr },
        });

        // Mapear estado
        const nuevoEstado = mapearStatusAIncidenciaEstado(fila.statusAdicional);

        if (incidenciaExistente) {
          // Actualizar incidencia existente
          await prisma.incidencia.update({
            where: { id: incidenciaExistente.id },
            data: {
              estado: nuevoEstado,
              descripcion: fila.comentarios || incidenciaExistente.descripcion,
              fechaVisitaProgramada: fila.fechaPrevista || incidenciaExistente.fechaVisitaProgramada,
              fechaResuelta: fila.fechaFinalizacion || incidenciaExistente.fechaResuelta,
              // Si el estado cambió a EN_CAMINO o RESUELTA, actualizar fechas
              ...(nuevoEstado === "EN_CAMINO" && !incidenciaExistente.fechaEnCamino
                ? { fechaEnCamino: new Date() }
                : {}),
              ...(nuevoEstado === "RESUELTA" && !incidenciaExistente.fechaResuelta
                ? { fechaResuelta: new Date() }
                : {}),
            },
          });
          incidenciasActualizadas++;
        } else {
          // Crear nueva incidencia
          const nueva = await prisma.incidencia.create({
            data: {
              ticketExternoId: fila.sr,
              origen: "MANUAL",
              // Este Excel de instalaciones semanales es siempre de Altadis
              // Península — no hay otra señal de proyecto en este origen.
              proyecto: "PENINSULA",
              tipo: "INSTALACION_NUEVA",
              cliente: fila.expendeduria,
              titulo: `Instalar ${fila.mobiliario}`,
              descripcion: fila.comentarios,
              direccion: estanco.municipio
                ? `${estanco.municipio}${estanco.provincia ? `, ${estanco.provincia}` : ""}`
                : undefined,
              estado: nuevoEstado,
              estancoId: estanco.id,
              fechaImportada: fila.fechaCreacion || new Date(),
              fechaVisitaProgramada: fila.fechaPrevista,
              fechaResuelta: fila.fechaFinalizacion,
              // Si ya está resuelto al importar, poner fecha
              ...(nuevoEstado === "RESUELTA" && !fila.fechaFinalizacion
                ? { fechaResuelta: new Date() }
                : {}),
              // Pendiente de confirmar viabilidad con el comercial antes de
              // poder asignarla a un técnico (ver src/lib/viabilidad.ts).
              viabilidadEstado: "PENDIENTE_RESPUESTA",
              viabilidadExcelFileId: excelFileId,
              viabilidadExcelFila: fila.filaExcel,
            },
          });
          incidenciasCreadas++;
          instalacionesNuevasIds.push(nueva.id);
        }
      } catch (err) {
        erroresImporte.push(
          `${fila.sr}: ${err instanceof Error ? err.message : "error desconocido"}`
        );
      }
    }

    // Registrar importación
    await prisma.instalacionImportHistory.create({
      data: {
        usuarioId: session.userId,
        totalFilas: filas.length,
        incidenciasCreadas,
        incidenciasActualizadas,
        instalacionesSaltadas: erroresImporte.length,
        erroresValidacion: erroresImporte.length > 0 ? JSON.stringify(erroresImporte) : null,
        detalles: errores.length > 0 ? JSON.stringify(errores) : null,
        archivoNombre: archivo.name,
      },
    });

    console.log(
      `[incidencias/importar-instalaciones] Completado: ${incidenciasCreadas} creadas, ${incidenciasActualizadas} actualizadas, ${erroresImporte.length} errores`
    );

    // Este Excel es la única fuente de datos nuevos de "Censo" (y también
    // alimenta Informe/Intervenciones, que muestran las mismas incidencias)
    // — sin esto, lo importado no aparecía en los documentos en vivo hasta
    // que alguna acción no relacionada forzaba de rebote un resync completo.
    await syncToSheets(["incidencias", "intervenciones", "censo"]);

    // Se envía el formulario de viabilidad solo para las instalaciones
    // NUEVAS (no en cada reimportación semanal de una ya existente). En
    // segundo plano: un fallo de email de una fila no debe bloquear la
    // respuesta de la importación, que ya ha guardado todo en BD.
    for (const id of instalacionesNuevasIds) {
      solicitarViabilidadComercial(id).catch((err) =>
        console.error(`[importar-instalaciones] Error solicitando viabilidad para ${id}:`, err)
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Importación completada",
      incidenciasCreadas,
      incidenciasActualizadas,
      instalacionesSaltadas: erroresImporte.length,
      errores: erroresImporte.length > 0 ? erroresImporte.slice(0, 10) : undefined,
      detalles: errores.length > 0 ? errores.slice(0, 5) : undefined,
    });
  } catch (err) {
    console.error("[incidencias/importar-instalaciones] Error:", err);
    return NextResponse.json(
      {
        error: "Error procesando archivo: " + (err instanceof Error ? err.message : "desconocido"),
      },
      { status: 500 }
    );
  }
}
