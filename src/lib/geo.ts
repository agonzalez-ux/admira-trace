import { prisma } from "./prisma";

/**
 * Geocodificación de direcciones vía OpenStreetMap/Nominatim (gratuito, sin API key)
 * y distancia en línea recta (Haversine).
 *
 * OJO: es distancia en línea recta, NO la ruta real por carretera — sirve para
 * ordenar técnicos por cercanía, no como estimación de tiempo de viaje.
 *
 * Nominatim exige un User-Agent identificativo y como máximo 1 petición/segundo.
 */
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "AdmiraTrace/1.0 (gestion interna de instalaciones)";
const MIN_INTERVALO_MS = 1100;

let ultimaPeticion = 0;
// Cola de turnos: si dos llamadas a geocodificar() se solapan (p. ej. el
// relleno en segundo plano de varios técnicos a la vez), cada una encadena su
// espera detrás de la anterior en vez de leer/escribir `ultimaPeticion` por su
// cuenta, que dejaba una ventana donde dos peticiones podían colarse casi a
// la vez y saltarse el límite de 1/segundo de Nominatim.
let colaTurnos: Promise<void> = Promise.resolve();

function esperarTurno(): Promise<void> {
  const miTurno = colaTurnos.then(async () => {
    const ahora = Date.now();
    const espera = ultimaPeticion + MIN_INTERVALO_MS - ahora;
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaPeticion = Date.now();
  });
  // Si esta espera falla por lo que sea, no debe atascar la cola para las siguientes.
  colaTurnos = miTurno.catch(() => {});
  return miTurno;
}

export async function geocodificar(direccion: string): Promise<{ lat: number; lon: number } | null> {
  if (!direccion?.trim()) return null;
  await esperarTurno();

  const params = new URLSearchParams({
    q: direccion,
    format: "json",
    limit: "1",
    countrycodes: "es,pt,ad",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon };
  } catch (err) {
    console.error("[geo] Error geocodificando:", direccion, err);
    return null;
  }
}

/** Distancia en línea recta entre dos coordenadas, en kilómetros. */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371; // radio de la Tierra en km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Relleno en segundo plano de coordenadas de técnicos que aún no las tienen.
// Se lanza cada vez que alguien pide "técnicos más cercanos" para una
// incidencia. Sin este candado, pedirlo para varias incidencias seguidas (algo
// muy normal con cientos de tickets sin asignar) lanzaba un barrido completo
// nuevo cada vez, todos compitiendo por la misma cola de 1 petición/segundo de
// Nominatim — y una petición en primer plano (la del propio estanco de la
// incidencia, que si bloquea la respuesta) podía quedar atascada varios
// minutos detrás de esa cola, superando el tiempo de espera del túnel y
// devolviendo la lista sin ninguna distancia. Ahora solo hay un barrido activo
// a la vez, y cada pasada procesa como mucho unos pocos técnicos para no
// acaparar la cola durante mucho rato.
let rellenoEnCurso = false;
const LOTE_MAXIMO_POR_PASADA = 8;

/**
 * Lanza (si no hay ya uno en marcha) un relleno en segundo plano de
 * coordenadas para los técnicos indicados que aún no las tengan. No bloquea:
 * se puede llamar sin await.
 */
export function rellenarCoordsTecnicosEnSegundoPlano(tecnicoIds: string[]): void {
  if (rellenoEnCurso || tecnicoIds.length === 0) return;
  rellenoEnCurso = true;

  (async () => {
    try {
      for (const id of tecnicoIds.slice(0, LOTE_MAXIMO_POR_PASADA)) {
        try {
          await asegurarCoordsTecnico(id);
        } catch (err) {
          console.error("[geo] Error geocodificando técnico en segundo plano:", id, err);
        }
      }
    } finally {
      rellenoEnCurso = false;
    }
  })();
}

/** Geocodifica y guarda las coordenadas de un técnico, si aún no las tiene. */
export async function asegurarCoordsTecnico(tecnicoId: string): Promise<{ lat: number; lon: number } | null> {
  const t = await prisma.user.findUnique({ where: { id: tecnicoId } });
  if (!t) return null;
  if (t.lat !== null && t.lon !== null) return { lat: t.lat, lon: t.lon };

  const busqueda = t.direccion || t.zona;
  if (!busqueda) return null;

  const coords = await geocodificar(busqueda);
  if (!coords) return null;

  await prisma.user.update({ where: { id: tecnicoId }, data: { lat: coords.lat, lon: coords.lon } });
  return coords;
}

/** Geocodifica y guarda las coordenadas de un estanco, si aún no las tiene. */
export async function asegurarCoordsEstanco(estancoId: string): Promise<{ lat: number; lon: number } | null> {
  const e = await prisma.estanco.findUnique({ where: { id: estancoId } });
  if (!e) return null;
  if (e.lat !== null && e.lon !== null) return { lat: e.lat, lon: e.lon };

  // Se prueba de lo más específico a lo más genérico: si la calle exacta no se
  // encuentra, al menos el municipio/provincia da una aproximación útil.
  const intentos = [
    [e.direccion, e.municipio, e.codigoPostal, e.provincia, "España"].filter(Boolean).join(", "),
    [e.municipio, e.provincia, "España"].filter(Boolean).join(", "),
    [e.provincia, "España"].filter(Boolean).join(", "),
  ].filter((s) => s.length > 8);

  for (const intento of intentos) {
    const coords = await geocodificar(intento);
    if (coords) {
      await prisma.estanco.update({ where: { id: estancoId }, data: { lat: coords.lat, lon: coords.lon } });
      return coords;
    }
  }
  return null;
}
