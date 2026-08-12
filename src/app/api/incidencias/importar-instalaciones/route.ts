import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIRA') {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const archivo = formData.get('archivo') as File;

    if (!archivo) {
      return NextResponse.json({ error: 'No se subió ningún archivo.' }, { status: 400 });
    }

    if (!archivo.name.endsWith('.xlsx') && !archivo.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Solo se aceptan archivos Excel (.xlsx, .xls)' },
        { status: 400 }
      );
    }

    // TODO: Cuando recibas el Excel real, aquí va la lógica de:
    // 1. Parsear el archivo
    // 2. Validar estructura (Cliente, Dirección, CP, Provincia, etc.)
    // 3. Para cada fila:
    //    - Detectar si ya existe una incidencia "la misma" (merge logic)
    //    - Si existe, actualizar su estado
    //    - Si es nueva, crear incidencia de tipo INSTALACION_NUEVA
    // 4. Llamar a syncToSheets() para actualizar censo
    // 5. Guardar en InstalacionImportHistory

    // Por ahora, devolvemos un placeholder:
    return NextResponse.json({
      mensaje: 'Importación completada (PLACEHOLDER - esperando estructura real del Excel)',
      incidenciasCreadas: 0,
      incidenciasActualizadas: 0,
      instalacionesSaltadas: 0,
    });
  } catch (err) {
    console.error('[incidencias/importar-instalaciones]', err);
    return NextResponse.json(
      { error: 'Error procesando archivo: ' + (err instanceof Error ? err.message : 'desconocido') },
      { status: 500 }
    );
  }
}
