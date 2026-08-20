import { PROYECTOS, Proyecto } from "./constants";

/**
 * A qué de los 5 proyectos corresponde el campo "project" que devuelve el
 * desk (guardado como Incidencia.deskProyecto). Confirmado contra los datos
 * reales: "Altadis" (el proyecto principal, sin sufijo) es Península; los
 * demás llevan el nombre del proyecto en el propio texto. Cualquier otro
 * valor (o ninguno) se deja sin proyecto para revisión manual, en vez de
 * adivinar.
 */
export function proyectoDesdeDesk(deskProyecto: string | null | undefined): Proyecto | null {
  const s = (deskProyecto || "").toLowerCase();
  if (!s) return null;
  if (s.includes("blu")) return "BLU";
  if (s.includes("andorra")) return "ANDORRA";
  if (s.includes("canarias")) return "CANARIAS";
  if (s.includes("portugal")) return "PORTUGAL";
  if (s.includes("altadis")) return "PENINSULA";
  return null;
}

/**
 * A qué proyecto corresponde el texto "Proyecto: X" que llevaba cada unidad
 * en el Excel de stock (guardado en Material.descripcion al importar). Esta
 * es OTRA clasificación distinta a la del desk — confirmado revisando los
 * estancos reales de cada etiqueta:
 *   - "Myblu" → Blu (mismo producto, nombre distinto al del desk).
 *   - "Altadis España" / "Altadis Doméstico" / "Travel Retail" → Península
 *     (Travel Retail son tiendas de aeropuerto/turísticas dentro de España,
 *     ej. Mallorca — canal distinto, pero mismo proyecto/mercado).
 * No había stock etiquetado para Andorra/Canarias/Portugal en el Excel.
 */
export function proyectoDesdeTextoMaterial(textoProyecto: string | null | undefined): Proyecto | null {
  const s = (textoProyecto || "").toLowerCase();
  if (!s) return null;
  if (s.includes("myblu") || s.includes("blu")) return "BLU";
  if (s.includes("andorra")) return "ANDORRA";
  if (s.includes("canarias")) return "CANARIAS";
  if (s.includes("portugal")) return "PORTUGAL";
  // "Altadis España", "Altadis Doméstico", "Travel Retail" y cualquier otra
  // variante no reconocida caen aquí: Península es, con diferencia, el
  // proyecto por defecto real.
  return "PENINSULA";
}

export function esProyectoValido(valor: unknown): valor is Proyecto {
  return typeof valor === "string" && (PROYECTOS as readonly string[]).includes(valor);
}
