/**
 * Sistema de limpieza automática mensual.
 * - Primer lunes del mes: borra fotos de incidencias resueltas
 * - Mantiene backup en /data/backups durante 1 año
 * - Registra cada limpieza en BD para auditoría
 */

import { prisma } from "./prisma";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import cron from "node-cron";

const copyFile = promisify(fs.copyFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const rmdir = promisify(fs.rmdir);

const BACKUPS_DIR = process.env.BACKUPS_DIR || "/data/backups";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/data/uploads";
const RETENTION_DAYS = 365; // 1 año

export interface CleanupResult {
  fotosMovidas: number;
  fotosEliminadas: number;
  backupsLimpiados: number;
  errores: string[];
  ejecutadoEn: Date;
}

/**
 * Ejecuta la limpieza mensual.
 * - Busca incidencias RESUELTA
 * - Mueve sus fotos a backup
 * - Borra backups antiguos (>1 año)
 */
export async function ejecutarLimpiezaMensual(): Promise<CleanupResult> {
  const resultado: CleanupResult = {
    fotosMovidas: 0,
    fotosEliminadas: 0,
    backupsLimpiados: 0,
    errores: [],
    ejecutadoEn: new Date(),
  };

  try {
    console.log("[cleanup] Iniciando limpieza mensual...");

    // 1. Crear directorio de backup si no existe
    const mesActual = new Date().toISOString().slice(0, 7); // YYYY-MM
    const dirBackupMes = path.join(BACKUPS_DIR, `fotos-${mesActual}`);

    try {
      await mkdir(dirBackupMes, { recursive: true });
      console.log(`[cleanup] Directorio de backup creado: ${dirBackupMes}`);
    } catch (err) {
      resultado.errores.push(`No se pudo crear directorio de backup: ${err}`);
      return resultado;
    }

    // 2. Buscar todas las incidencias RESUELTA
    const incidenciasResueltas = await prisma.incidencia.findMany({
      where: { estado: "RESUELTA" },
      include: { fotos: true },
    });

    console.log(`[cleanup] Encontradas ${incidenciasResueltas.length} incidencias resueltas`);

    // 3. Mover fotos de incidencias resueltas
    for (const inc of incidenciasResueltas) {
      for (const foto of inc.fotos) {
        try {
          // Extraer nombre de archivo de la URL
          // URL típica: /uploads/incidencias/ID/filename
          const urlParts = foto.url.split("/");
          const filename = urlParts[urlParts.length - 1];
          const incidenciaDir = urlParts[urlParts.length - 2];

          const sourceFile = path.join(UPLOADS_DIR, "incidencias", incidenciaDir, filename);
          const backupFile = path.join(dirBackupMes, `${inc.id}-${filename}`);

          // Copiar a backup
          if (fs.existsSync(sourceFile)) {
            await copyFile(sourceFile, backupFile);
            resultado.fotosMovidas++;
            console.log(`[cleanup] Copiada foto: ${filename}`);

            // Borrar original
            await unlink(sourceFile);
            resultado.fotosEliminadas++;
            console.log(`[cleanup] Eliminada foto original: ${filename}`);
          }
        } catch (err) {
          resultado.errores.push(`Error moviendo foto ${foto.url}: ${err}`);
        }
      }
    }

    // 4. Limpiar directorios de incidencias que quedaron vacíos
    try {
      const incidenciasDir = path.join(UPLOADS_DIR, "incidencias");
      const dirs = await readdir(incidenciasDir);

      for (const dir of dirs) {
        const dirPath = path.join(incidenciasDir, dir);
        const files = await readdir(dirPath);
        if (files.length === 0) {
          await rmdir(dirPath);
          console.log(`[cleanup] Directorio vacío eliminado: ${dir}`);
        }
      }
    } catch (err) {
      console.warn(`[cleanup] Error limpiando directorios vacíos: ${err}`);
    }

    // 5. Limpiar backups antiguos (>1 año)
    try {
      const backupDirs = await readdir(BACKUPS_DIR);

      for (const dir of backupDirs) {
        if (!dir.startsWith("fotos-")) continue;

        const dirPath = path.join(BACKUPS_DIR, dir);
        const stats = await stat(dirPath);
        const diasAntiguedad = Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24));

        if (diasAntiguedad > RETENTION_DAYS) {
          // Borrar directorio y su contenido
          const files = await readdir(dirPath);
          for (const file of files) {
            await unlink(path.join(dirPath, file));
          }
          await rmdir(dirPath);
          resultado.backupsLimpiados++;
          console.log(`[cleanup] Backup antiguo eliminado: ${dir} (${diasAntiguedad} días)`);
        }
      }
    } catch (err) {
      resultado.errores.push(`Error limpiando backups antiguos: ${err}`);
    }

    // 6. Registrar en BD (auditoría)
    // TODO: Crear tabla CleanupLog en schema.prisma
    // await prisma.cleanupLog.create({
    //   data: {
    //     fotosMovidas: resultado.fotosMovidas,
    //     fotosEliminadas: resultado.fotosEliminadas,
    //     backupsLimpiados: resultado.backupsLimpiados,
    //     erroresCount: resultado.errores.length,
    //     detalles: JSON.stringify(resultado.errores),
    //   },
    // });

    console.log("[cleanup] Limpieza completada", resultado);
    return resultado;
  } catch (err) {
    console.error("[cleanup] Error inesperado:", err);
    resultado.errores.push(`Error inesperado: ${err}`);
    return resultado;
  }
}

/**
 * Obtiene el próximo primer lunes del mes desde hoy.
 */
export function obtenerProximoPrimerLunes(): Date {
  const hoy = new Date();
  let fecha = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1); // Primer día del mes siguiente

  // Encontrar el primer lunes
  while (fecha.getDay() !== 1) {
    fecha.setDate(fecha.getDate() + 1);
  }

  return fecha;
}

/**
 * Calcula segundos hasta el próximo primer lunes a las 00:00.
 */
export function segundosHastaProximoReset(): number {
  const proximoLunes = obtenerProximoPrimerLunes();
  proximoLunes.setHours(0, 0, 0, 0);

  const ahora = new Date();
  const diferencia = proximoLunes.getTime() - ahora.getTime();

  return Math.max(0, Math.floor(diferencia / 1000));
}

let scheduledCleanup: cron.ScheduledTask | null = null;

/**
 * Inicializa el scheduler de limpieza mensual.
 * Se ejecuta al arrancar la aplicación (instrumentation.ts).
 *
 * Nota: como no sabemos exactamente qué día es el primer lunes del mes,
 * usamos un cron que se ejecuta todos los días a las 00:00 y comprueba
 * si hoy es el primer lunes. Así evitamos estar reiniciando.
 */
export async function initMonthlyCleanupScheduler(): Promise<void> {
  // Limpiar scheduler anterior si existe
  if (scheduledCleanup) {
    scheduledCleanup.stop();
    scheduledCleanup.destroy();
  }

  // Cron: ejecutar cada día a las 00:00
  // Expresión: "0 0 * * *" = todos los días a las 00:00:00
  scheduledCleanup = cron.schedule("0 0 * * *", async () => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Obtener el primer lunes del mes actual
    const primerLunes = obtenerProximoPrimerLunes();
    primerLunes.setHours(0, 0, 0, 0);

    // Si hoy es el primer lunes de siguiente mes, no hace nada
    // (el scheduler corre todos los días, así que ejecutaremos en el primer lunes)
    const proximoLunes = obtenerProximoPrimerLunes();
    proximoLunes.setHours(0, 0, 0, 0);

    // Si hoy es el primer lunes del próximo mes
    if (hoy.getTime() === proximoLunes.getTime()) {
      console.log(
        `[cleanup-scheduler] 🧹 Hoy es el primer lunes del mes (${hoy.toISOString().split("T")[0]}). Ejecutando limpieza...`
      );

      try {
        const inicio = Date.now();
        const resultado = await ejecutarLimpiezaMensual();
        const duracion = Math.floor((Date.now() - inicio) / 1000);

        // Registrar en BD
        await prisma.cleanupLog.create({
          data: {
            fotosMovidas: resultado.fotosMovidas,
            fotosEliminadas: resultado.fotosEliminadas,
            backupsLimpiados: resultado.backupsLimpiados,
            erroresCount: resultado.errores.length,
            detalles: resultado.errores.length > 0 ? JSON.stringify(resultado.errores) : null,
            tiempoEjecucion: duracion,
          },
        });

        console.log(
          `[cleanup-scheduler] ✅ Limpieza completada: ${resultado.fotosMovidas} fotos movidas, ${resultado.fotosEliminadas} eliminadas, ${resultado.backupsLimpiados} backups limpiados (${duracion}s)`
        );
      } catch (err) {
        console.error("[cleanup-scheduler] ❌ Error ejecutando limpieza:", err);
      }
    }
  });

  console.log("[cleanup-scheduler] ✅ Scheduler iniciado (se ejecuta diariamente a las 00:00)");
  console.log(
    `[cleanup-scheduler] ⏰ Próxima ejecución: ${obtenerProximoPrimerLunes().toISOString().split("T")[0]}`
  );
}

/**
 * Detiene el scheduler (útil para testing o shutdown).
 */
export function stopMonthlyCleanupScheduler(): void {
  if (scheduledCleanup) {
    scheduledCleanup.stop();
    scheduledCleanup.destroy();
    scheduledCleanup = null;
    console.log("[cleanup-scheduler] ⏹️ Scheduler detenido");
  }
}
