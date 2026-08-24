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

const PROVINCIAS_CANARIAS = ["las palmas", "gran canaria", "tenerife", "lanzarote", "fuerteventura"];

// Distritos/regiones reales de Portugal (los que aparecen hoy en la hoja de
// técnicos: Lisboa, Porto, Faro, Leiria, Viana do Castelo, Vila Real, Viseu,
// Caldas da Rainha, Tomar, Maia; el resto se deja por si se da de alta algún
// técnico nuevo de otra zona del país).
const DISTRITOS_PORTUGAL = [
  "lisboa", "porto", "faro", "leiria", "viana do castelo", "vila real", "viseu",
  "braga", "braganca", "bragança", "castelo branco", "coimbra", "evora", "évora",
  "guarda", "portalegre", "santarem", "santarém", "setubal", "setúbal", "beja",
  "aveiro", "acores", "açores", "madeira", "caldas da rainha", "tomar", "maia",
];

/**
 * A qué proyecto pertenece la zona/provincia de un técnico, cuando esa zona
 * deja claro de por sí el país/región (Andorra, Canarias, Portugal) — para
 * poder reconocerlos en el filtro de la pestaña "Técnicos" aunque todavía no
 * tengan ninguna incidencia/material con ese proyecto encima (ver
 * /api/tecnicos). Deliberadamente NO intenta distinguir Península de Blu por
 * zona (cualquier provincia española puede ser cualquiera de los dos), así
 * que ahí sigue haciendo falta la actividad real.
 */
export function proyectoDesdeZonaTecnico(zona: string | null | undefined): Proyecto | null {
  const s = (zona || "").toLowerCase().trim();
  if (!s) return null;
  if (s.includes("andorra")) return "ANDORRA";
  if (PROVINCIAS_CANARIAS.some((p) => s.includes(p))) return "CANARIAS";
  if (DISTRITOS_PORTUGAL.some((p) => s.includes(p))) return "PORTUGAL";
  return null;
}
