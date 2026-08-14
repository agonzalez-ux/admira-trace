# 🧹 Sistema de Limpieza Mensual Automática

## Descripción General

Admira Trace incluye un sistema automatizado que limpia las fotos de incidencias resueltas cada primer lunes del mes a las 00:00, liberando espacio en disco mientras mantiene un backup de 12 meses para auditoría.

## Cómo Funciona

### 1. **Ejecución Automática**
- **Cuándo:** Primer lunes de cada mes a las 00:00 (medianoche)
- **Qué hace:**
  - Busca todas las incidencias con estado `RESUELTA`
  - Copia sus fotos a `/data/backups/fotos-YYYY-MM/`
  - Elimina los archivos originales de `/data/uploads/`
  - Limpia directorios vacíos
  - Elimina backups más antiguos de 12 meses

### 2. **Monitoreo y Control**
Accede a `Admira > Mantenimiento` en el dashboard para:
- ✅ Ver el **próximo reset programado** (cuenta atrás)
- ▶️ **Ejecutar limpieza manualmente** en cualquier momento
- 📜 **Historial de limpiezas**: fecha, fotos movidas, errores

### 3. **Auditoría**
Cada limpieza se registra en la tabla `CleanupLog`:
- ID único de la limpieza
- Cantidad de fotos movidas/eliminadas
- Cantidad de backups limpiados
- Errores encontrados (si los hay)
- Tiempo de ejecución
- Fecha/hora exacta

## Archivos Implementados

### Backend
- **`src/lib/cleanupScheduler.ts`**
  - Función `ejecutarLimpiezaMensual()`: ejecuta la limpieza
  - Función `obtenerProximoPrimerLunes()`: calcula próximo lunes
  - Función `segundosHastaProximoReset()`: calcula segundos restantes
  - Función `initMonthlyCleanupScheduler()`: inicia el cron usando node-cron
  - Función `stopMonthlyCleanupScheduler()`: detiene el cron

- **`src/app/api/admin/cleanup/route.ts`**
  - `POST /api/admin/cleanup`: ejecuta limpieza manual
  - `GET /api/admin/cleanup/status`: obtiene estado y historial

### Frontend
- **`src/components/admin/CleanupPanel.tsx`**
  - Componente React para mostrar estado de limpiezas
  - Botón para ejecutar limpieza manual
  - Historial de últimas 5 limpiezas
  - Contador del próximo reset

- **`src/app/admira/mantenimiento/page.tsx`**
  - Página completa de mantenimiento (`/admira/mantenimiento`)
  - Documentación de cómo funciona el sistema

### Base de Datos
- **`CleanupLog` en `prisma/schema.prisma`**
  ```prisma
  model CleanupLog {
    id                    String   @id @default(cuid())
    fotosMovidas          Int      // Fotos copiadas a backup
    fotosEliminadas       Int      // Fotos borradas de producción
    backupsLimpiados      Int      // Directorios de backup (>1 año) eliminados
    erroresCount          Int      @default(0)
    detalles              String?  // JSON con errores encontrados
    ejecutadoEn           DateTime @default(now())
    tiempoEjecucion       Int?     // Segundos que tardó
    createdAt             DateTime @default(now())
  }
  ```

### Inicialización
- **`instrumentation.ts`**
  - Se ejecuta cuando arranca Next.js
  - Llama a `initMonthlyCleanupScheduler()` para activar el cron

## Estructura de Backups

```
/data/backups/
├── fotos-2026-01/       # Enero 2026
│   ├── incidencia-1-foto1.jpg
│   ├── incidencia-1-foto2.jpg
│   └── incidencia-3-foto1.jpg
├── fotos-2026-02/       # Febrero 2026
│   └── ...
└── fotos-2026-08/       # Agosto 2026
    └── ...
```

**Retención:** Se eliminan automáticamente después de 12 meses.

## Uso

### Ejecutar Limpieza Manualmente

1. Accede a **Admira > Mantenimiento** en el dashboard
2. Haz clic en **"🧹 Ejecutar limpieza ahora"**
3. El sistema:
   - Copia todas las fotos de incidencias resueltas a backup
   - Elimina los archivos originales
   - Actualiza el historial
   - Muestra los resultados en tiempo real

### Ver Estado

En la misma página puedes:
- Ver el próximo reset programado (en cuánto tiempo)
- Ver el historial de las últimas 5 limpiezas ejecutadas
- Verificar si hubo errores en cada limpieza

### A través de API

**Ejecutar limpieza:**
```bash
curl -X POST http://localhost:3000/api/admin/cleanup \
  -H "Content-Type: application/json"
```

**Obtener estado:**
```bash
curl http://localhost:3000/api/admin/cleanup
```

Ambos endpoints requieren que el usuario tenga rol `ADMIRA`.

## Configuración

Las rutas de almacenamiento se configuran con variables de entorno:

```env
# .env.local o variables del servidor
UPLOADS_DIR=/data/uploads          # Dónde se guardan fotos en producción
BACKUPS_DIR=/data/backups          # Dónde se guardan backups
```

Si no están definidas, usan valores por defecto (`/data/uploads` y `/data/backups`).

## En Producción (AWS VPS)

1. **Crear directorios:**
   ```bash
   mkdir -p /data/uploads
   mkdir -p /data/backups
   chmod 755 /data/uploads /data/backups
   ```

2. **Variables en `.env`:**
   ```env
   UPLOADS_DIR=/data/uploads
   BACKUPS_DIR=/data/backups
   ```

3. **Espacio en disco recomendado:**
   - `/data/uploads`: dinámico (se limpia cada mes)
   - `/data/backups`: ~100-500 GB (según cantidad de fotos)

4. **Monitoreo:**
   - Usa `df -h` para ver uso de disco
   - Los logs de cada limpieza aparecen en la tabla `CleanupLog`
   - El dashboard muestra el estado en tiempo real

## Notas Técnicas

### Cron Expression
```
0 0 * * *   = Todos los días a las 00:00 (medianoche)
```

El scheduler verifica CADA DÍA si es el primer lunes del mes. Si sí, ejecuta la limpieza.

### Tolerancia de Errores
- Si una foto no existe, se registra el error pero continúa
- Si el backup falla, se registra y se saltea ese archivo
- Si el backup de directorios antiguos falla, se continúa de todas formas
- Todos los errores se guardan en `CleanupLog.detalles` para auditoría

### Performance
- Limpieza típica de 1000 fotos: ~30-60 segundos
- Se ejecuta de noche, no afecta uso diurno
- Los archivos se borran una por una (no bulk delete)

## Recuperación de Archivos

Si necesitas recuperar una foto que fue borrada:

1. Accede a `/data/backups/fotos-YYYY-MM/` en el servidor
2. Busca el archivo por ID de incidencia: `{incidenciaId}-{filename}`
3. Copiar de vuelta a `/data/uploads/incidencias/{incidenciaId}/`

## Ejemplos de Logs

```
[cleanup-scheduler] 🧹 Hoy es el primer lunes del mes (2026-09-07). Ejecutando limpieza...
[cleanup] Iniciando limpieza mensual...
[cleanup] Directorio de backup creado: /data/backups/fotos-2026-09
[cleanup] Encontradas 245 incidencias resueltas
[cleanup] Copiada foto: qr_001.jpg
[cleanup] Eliminada foto original: qr_001.jpg
...
[cleanup] Limpieza completada { fotosMovidas: 1342, fotosEliminadas: 1342, backupsLimpiados: 0 }
[cleanup-scheduler] ✅ Limpieza completada: 1342 fotos movidas, 1342 eliminadas, 0 backups limpiados (47s)
```

## Troubleshooting

**P: El scheduler no se ejecuta**
- Revisa los logs de Next.js en inicio
- Asegúrate de que `instrumentation.ts` está en la raíz del proyecto
- Reinicia la aplicación

**P: Las fotos no se están moviendo**
- Verifica que existen los directorios `/data/uploads` y `/data/backups`
- Revisa los permisos de lectura/escritura
- Consulta `CleanupLog.detalles` para ver errores específicos

**P: El cron se ejecuta pero tarda mucho**
- Si hay muchas fotos, es normal (1 segundo por foto aproximadamente)
- Considera ejecutar fuera de horario pico

**P: Necesito cambiar el día/hora**
- Edita la expresión cron en `cleanupScheduler.ts`
- La lógica del "primer lunes" está en `obtenerProximoPrimerLunes()`
- Si quieres cambiar a un día específico, ajusta esa función

## Mantenimiento Futuro

Mejoras planificadas:
- [ ] Compresión de backups (ZIP/TAR)
- [ ] Notificaciones por email cuando se complete la limpieza
- [ ] Descarga de backups desde el dashboard
- [ ] Estadísticas visuales de espacio liberado
- [ ] Limpieza incremental (solo fotos de la última semana)
