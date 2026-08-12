import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseExcelAsignaciones } from "@/lib/excel-import";

/**
 * POST /api/estancos/importar
 * Importa/actualiza estancos desde el Excel mensual ASIGNACIONES.
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

    console.log(`[estancos/importar] Importando ${archivo.name} (${archivo.size} bytes)...`);

    // Parsear el Excel
    const { filas, errores } = await parseExcelAsignaciones(archivo);

    if (filas.length === 0) {
      return NextResponse.json(
        {
          error: "No se encontraron filas de datos en el Excel",
          detalles: errores,
        },
        { status: 400 }
      );
    }

    // Importar en la BD
    let estancosCreados = 0;
    let estancosActualizados = 0;
    const erroresImporte: string[] = [];

    for (const fila of filas) {
      try {
        // Buscar estanco por idEstanco
        const estancoExistente = await prisma.estanco.findUnique({
          where: { idEstanco: fila.idEstanco },
        });

        if (estancoExistente) {
          // Actualizar
          await prisma.estanco.update({
            where: { idEstanco: fila.idEstanco },
            data: {
              nombre: fila.nombre,
              zona: fila.zona,
              provincia: fila.provincia,
              codigoPostal: fila.codigoPostal,
              municipio: fila.municipio,
              comercial: fila.comercial,
              correoComercial: fila.correoComercial,
              telefonoComercial: fila.telefonoComercial,
              frecuencia: fila.frecuencia,
              segmento: fila.segmento,
            },
          });
          estancosActualizados++;
        } else {
          // Crear
          await prisma.estanco.create({
            data: {
              idEstanco: fila.idEstanco,
              nombre: fila.nombre,
              zona: fila.zona,
              provincia: fila.provincia,
              codigoPostal: fila.codigoPostal,
              municipio: fila.municipio,
              comercial: fila.comercial,
              correoComercial: fila.correoComercial,
              telefonoComercial: fila.telefonoComercial,
              frecuencia: fila.frecuencia,
              segmento: fila.segmento,
            },
          });
          estancosCreados++;
        }
      } catch (err) {
        erroresImporte.push(
          `Estanco ${fila.idEstanco}: ${err instanceof Error ? err.message : "error desconocido"}`
        );
      }
    }

    // Registrar importación
    await prisma.estancoImportHistory.create({
      data: {
        usuarioId: session.id,
        totalFilas: filas.length,
        estancosCreados,
        estancosActualizados,
        estancosSaltados: erroresImporte.length,
        erroresValidacion: erroresImporte.length > 0 ? JSON.stringify(erroresImporte) : null,
        detalles: errores.length > 0 ? JSON.stringify(errores) : null,
        archivoNombre: archivo.name,
      },
    });

    console.log(
      `[estancos/importar] Completado: ${estancosCreados} creados, ${estancosActualizados} actualizados, ${erroresImporte.length} errores`
    );

    // TODO: Sincronizar con Google Sheets (syncToSheets)

    return NextResponse.json({
      ok: true,
      mensaje: "Importación completada",
      estancosCreados,
      estancosActualizados,
      estancosSaltados: erroresImporte.length,
      errores: erroresImporte.length > 0 ? erroresImporte.slice(0, 10) : undefined, // Mostrar máximo 10
      detalles: errores.length > 0 ? errores.slice(0, 5) : undefined,
    });
  } catch (err) {
    console.error("[estancos/importar] Error:", err);
    return NextResponse.json(
      {
        error: "Error procesando archivo: " + (err instanceof Error ? err.message : "desconocido"),
      },
      { status: 500 }
    );
  }
}
