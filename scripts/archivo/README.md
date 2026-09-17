# Scripts archivados

Scripts puntuales (migraciones, backfills, altas de usuario concretas,
demos) ya ejecutados contra producción. Se guardan aquí en vez de borrarlos
por si algún día hace falta releer exactamente qué hicieron, pero no se
espera volver a ejecutarlos — cada uno documenta en su cabecera cuándo y
para qué se usó.

Los scripts que siguen viviendo en `scripts/` (sin archivar) son los que se
reutilizan de verdad: sincronizaciones (`sync-estancos-desde-sheet.ts`,
`import-tecnicos.ts`...), backups, diagnóstico (`diagnosticar-sync-desk.ts`,
`revisar-datos-produccion.ts`, `probar-smtp.ts`) y utilidades de
mantenimiento (`resetear-passwords-staff.ts`, `aplicar-migracion-turso.ts`).
