'use client';

import { useState } from 'react';

type TabActiva = 'estancos' | 'instalaciones';

export default function ImportarDatos() {
  const [tabActiva, setTabActiva] = useState<TabActiva>('estancos');
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{tipo: 'exito' | 'error'; mensaje: string} | null>(null);

  const handleArrastrar = (e: React.DragEvent, tipo: TabActiva) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSoltar = async (e: React.DragEvent, tipo: TabActiva) => {
    e.preventDefault();
    e.stopPropagation();

    const archivos = e.dataTransfer.files;
    if (!archivos || archivos.length === 0) return;

    const archivo = archivos[0];
    if (!archivo.name.endsWith('.xlsx') && !archivo.name.endsWith('.xls')) {
      setResultado({ tipo: 'error', mensaje: 'Solo se aceptan archivos Excel (.xlsx, .xls)' });
      return;
    }

    setCargando(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append('archivo', archivo);

      const endpoint = tipo === 'estancos' ? '/api/estancos/importar' : '/api/incidencias/importar-instalaciones';
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setResultado({ tipo: 'error', mensaje: data.error || 'Error al procesar el archivo' });
      } else {
        setResultado({ tipo: 'exito', mensaje: data.mensaje || 'Importación realizada correctamente' });
      }
    } catch (err) {
      setResultado({ tipo: 'error', mensaje: 'Error de red: ' + (err instanceof Error ? err.message : 'desconocido') });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTabActiva('estancos')}
          className={`px-4 py-2 font-medium transition ${
            tabActiva === 'estancos'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📋 Actualizar Comerciales
        </button>
        <button
          onClick={() => setTabActiva('instalaciones')}
          className={`px-4 py-2 font-medium transition ${
            tabActiva === 'instalaciones'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          📦 Importar Instalaciones
        </button>
      </div>

      {/* Sección Estancos */}
      {tabActiva === 'estancos' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">📋 Universo de Comerciales</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">¿Qué es?</h3>
                <p className="text-gray-700 mt-1">
                  Directorio maestro de estancos (puntos de venta). Se actualiza mensualmente con la información
                  de ubicaciones, comerciales asignados, teléfonos y contactos.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">¿Cuándo se sube?</h3>
                <p className="text-gray-700 mt-1">
                  Cada mes, cuando recibas el Excel actualizado "Universo de Comerciales" desde la dirección.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">¿Qué pasa cuando lo subes?</h3>
                <ul className="text-gray-700 mt-1 list-disc list-inside space-y-1">
                  <li>✅ Se actualizan los estancos en la plataforma</li>
                  <li>✅ Se sincroniza automáticamente con Google Sheets</li>
                  <li>✅ Se guarda registro de la importación (historial)</li>
                  <li>⚠️ No se duplican datos existentes</li>
                </ul>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Requisitos del Excel:</h3>
                <p className="text-sm text-gray-600 mb-2">
                  El archivo debe tener las siguientes columnas (en cualquier orden):
                </p>
                <div className="bg-white rounded p-3 text-sm font-mono text-gray-700 overflow-x-auto">
                  <div>ID Estanco • Nombre • Dirección • Municipio • CP • Provincia</div>
                  <div>Teléfono • Zona • Frecuencia • Segmento • Comercial</div>
                  <div>Teléfono Comercial • Comentario • Correo Comercial</div>
                </div>
              </div>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => handleArrastrar(e, 'estancos')}
            onDrop={(e) => handleSoltar(e, 'estancos')}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer ${
              cargando
                ? 'border-gray-300 bg-gray-50'
                : 'border-blue-300 bg-blue-50 hover:bg-blue-100'
            }`}
          >
            {cargando ? (
              <div className="space-y-2">
                <div className="animate-spin text-2xl">⏳</div>
                <p className="text-gray-600">Procesando archivo...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-3xl">📁</p>
                <p className="text-gray-900 font-semibold">Arrastra el Excel aquí</p>
                <p className="text-sm text-gray-600">o haz clic para seleccionar</p>
              </div>
            )}
          </div>

          {resultado && (
            <div
              className={`rounded-lg p-4 ${
                resultado.tipo === 'exito'
                  ? 'bg-green-50 border border-green-200 text-green-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              <p className="font-semibold">{resultado.tipo === 'exito' ? '✅' : '❌'} {resultado.mensaje}</p>
            </div>
          )}
        </div>
      )}

      {/* Sección Instalaciones */}
      {tabActiva === 'instalaciones' && (
        <div className="space-y-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">📦 Instalaciones Semanales</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900">¿Qué es?</h3>
                <p className="text-gray-700 mt-1">
                  Listado semanal de instalaciones que hay que realizar. Altadis te lo envía cada semana con
                  ubicaciones, clientes y toda la información necesaria para el técnico.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">¿Cuándo se sube?</h3>
                <p className="text-gray-700 mt-1">
                  Cada jueves (o cuando Altadis envíe el Excel actualizado). El mismo archivo se reutiliza durante
                  toda la semana — cada vez que lo subes, se actualiza el estado de las instalaciones existentes
                  y se crean las nuevas.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900">¿Qué pasa cuando lo subes?</h3>
                <ul className="text-gray-700 mt-1 list-disc list-inside space-y-1">
                  <li>✅ Se crean nuevas incidencias de instalación</li>
                  <li>✅ Se actualizan las existentes (si cambió el estado)</li>
                  <li>✅ Se sincroniza con Google Sheets (censo total)</li>
                  <li>✅ Aparecen en el tablero de incidencias listas para asignar técnico</li>
                  <li>⚠️ No se generan duplicados</li>
                </ul>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Requisitos del Excel:</h3>
                <p className="text-sm text-gray-600 mb-2">
                  El archivo debe tener las siguientes columnas (en cualquier orden):
                </p>
                <div className="bg-white rounded p-3 text-sm font-mono text-gray-700 overflow-x-auto">
                  <div>Cliente • Dirección • Municipio • CP • Provincia</div>
                  <div>Estanco ID (opcional) • Tipo Instalación • Notas • Comercial</div>
                </div>
              </div>
            </div>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => handleArrastrar(e, 'instalaciones')}
            onDrop={(e) => handleSoltar(e, 'instalaciones')}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition cursor-pointer ${
              cargando
                ? 'border-gray-300 bg-gray-50'
                : 'border-purple-300 bg-purple-50 hover:bg-purple-100'
            }`}
          >
            {cargando ? (
              <div className="space-y-2">
                <div className="animate-spin text-2xl">⏳</div>
                <p className="text-gray-600">Procesando archivo...</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-3xl">📁</p>
                <p className="text-gray-900 font-semibold">Arrastra el Excel aquí</p>
                <p className="text-sm text-gray-600">o haz clic para seleccionar</p>
              </div>
            )}
          </div>

          {resultado && (
            <div
              className={`rounded-lg p-4 ${
                resultado.tipo === 'exito'
                  ? 'bg-green-50 border border-green-200 text-green-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              <p className="font-semibold">{resultado.tipo === 'exito' ? '✅' : '❌'} {resultado.mensaje}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
