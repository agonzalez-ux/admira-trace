/**
 * Configuración de la integración con el desk de tickets de Admira
 * (http://api.desk.admira.com).
 *
 * Proyectos de Altadis a sincronizar en el portal de incidencias de la app.
 * Confirmados con el cliente: los 4 proyectos principales + 3 adicionales
 * de Altadis detectados en el listado de /api/projects/all.
 *
 * Se excluyen deliberadamente otros proyectos con nombres parecidos que
 * pertenecen a otros clientes de Admira (100M BLUE / PORTUGAL 100M BLUE de
 * Restalia, Andorra Telecom, Bluepoint Solutions, BLUESPACE, Bluetoothbrw).
 */
export const DESK_ALTADIS_PROJECTS = [
  { id: 173, projectId: 2685, name: "Altadis" },
  { id: 304, projectId: 3862, name: "Altadis Blu" },
  { id: 319, projectId: 3782, name: "Altadis Portugal" },
  { id: 1587, projectId: 4868, name: "Altadis Andorra" },
  { id: 281, projectId: 3495, name: "Altadis Canarias" },
  { id: 1762, projectId: 5051, name: "Altadis Pulze (Portugal)" },
  { id: 1998, projectId: 5292, name: "Altadis Backoffices Test" },
] as const;

export const DESK_ALTADIS_PROJECT_IDS = DESK_ALTADIS_PROJECTS.map((p) => p.projectId);
