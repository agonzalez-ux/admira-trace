import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ImportarDatos from '@/components/ImportarDatos';

export default async function ImportarDatosPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIRA') {
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">📤 Importar / Actualizar Datos</h1>
          <p className="text-gray-600 mt-2">
            Sube los Excels mensuales y semanales para mantener los datos sincronizados automáticamente.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow">
          <ImportarDatos />
        </div>

        {/* Historial (placeholder) */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">📊 Historial de Importaciones</h2>
          <p className="text-gray-600 text-sm">
            Próximamente: historial de todas las importaciones realizadas (quién, cuándo, cuántos registros).
          </p>
        </div>
      </div>
    </main>
  );
}
