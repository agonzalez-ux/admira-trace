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
    // 1. Parsear el archivo con una librería como exceljs o xlsx
    // 2. Validar que tenga las columnas requeridas
    // 3. Actualizar/crear estancos en la BD
    // 4. Llamar a syncToSheets() para sincronizar con Google Sheets
    // 5. Guardar en EstancoImportHistory

    // Por ahora, devolvemos un placeholder:
    return NextResponse.json({
      mensaje: 'Importación completada (PLACEHOLDER - esperando estructura real del Excel)',
      estancosCreados: 0,
      estancosActualizados: 0,
      estancosSaltados: 0,
    });
  } catch (err) {
    console.error('[estancos/importar]', err);
    return NextResponse.json(
      { error: 'Error procesando archivo: ' + (err instanceof Error ? err.message : 'desconocido') },
      { status: 500 }
    );
  }
}
