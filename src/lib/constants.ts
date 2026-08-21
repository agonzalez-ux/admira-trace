export const ROLES = ["TECNICO", "ADMIRA", "FDM"] as const;
export type Rol = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Rol, string> = {
  TECNICO: "Técnico",
  ADMIRA: "Admira",
  FDM: "FDM",
};

// Los 5 proyectos Altadis que Admira gestiona con la misma plataforma. Ver
// src/lib/proyectos.ts para el mapeo desde los datos del desk/Excel.
export const PROYECTOS = ["PENINSULA", "BLU", "ANDORRA", "CANARIAS", "PORTUGAL"] as const;
export type Proyecto = (typeof PROYECTOS)[number];

export const PROYECTO_LABELS: Record<Proyecto, string> = {
  PENINSULA: "Altadis Península",
  BLU: "Altadis Blu",
  ANDORRA: "Altadis Andorra",
  CANARIAS: "Altadis Canarias",
  PORTUGAL: "Altadis Portugal",
};

export const TIPOS_MATERIAL = [
  "PANTALLA",
  "ROUTER",
  "PC",
  "REPRODUCTOR",
  "SOPORTE",
  "CABLEADO",
  "MOBILIARIO",
  "OTRO",
] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];

export const TIPO_MATERIAL_LABELS: Record<TipoMaterial, string> = {
  PANTALLA: "Pantalla",
  ROUTER: "Router",
  PC: "PC",
  REPRODUCTOR: "Reproductor",
  SOPORTE: "Soporte / anclaje",
  CABLEADO: "Cableado",
  MOBILIARIO: "Mobiliario",
  OTRO: "Otro",
};

export const ESTADOS_MATERIAL = [
  "EN_FDM",
  "EN_ADMIRA",
  "EN_TRANSITO_ENVIO",
  "EN_TECNICO",
  "EN_TRANSITO_RECOGIDA",
  "INSTALADO",
  "BAJA",
] as const;
export type EstadoMaterial = (typeof ESTADOS_MATERIAL)[number];

export const ESTADO_MATERIAL_LABELS: Record<EstadoMaterial, string> = {
  EN_FDM: "En almacén FDM",
  EN_ADMIRA: "En almacén Admira",
  EN_TRANSITO_ENVIO: "En tránsito (envío)",
  EN_TECNICO: "En poder del técnico",
  EN_TRANSITO_RECOGIDA: "En tránsito (recogida)",
  INSTALADO: "Instalado",
  BAJA: "Baja",
};

// Frecuencias predefinidas para las órdenes de envío recurrente.
export const FRECUENCIAS_RECURRENTES = [
  { dias: 7, label: "Cada semana" },
  { dias: 14, label: "Cada 2 semanas" },
  { dias: 30, label: "Cada mes" },
  { dias: 60, label: "Cada 2 meses" },
  { dias: 90, label: "Cada 3 meses" },
] as const;

export const TIPOS_ENVIO = ["ENVIO", "RECOGIDA", "TRANSFERENCIA"] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];

export const TRANSPORTISTAS = ["MARESA", "RENUS", "GLS", "OTRO"] as const;
export type Transportista = (typeof TRANSPORTISTAS)[number];

// "RENUS" es el valor interno histórico — el transportista real se llama
// "Rhenus", se muestra así en toda la interfaz sin tocar lo ya guardado.
export const TRANSPORTISTA_LABELS: Record<Transportista, string> = {
  MARESA: "Maresa",
  RENUS: "Rhenus",
  GLS: "GLS",
  OTRO: "Otro",
};

// Maresa y Rhenus se avisan con un email automático (ver
// src/lib/transportistas.ts); GLS se gestiona en su propio portal (solo se
// ofrece un enlace directo); "Otro" no automatiza nada.
export const TRANSPORTISTAS_CON_EMAIL_AUTOMATICO: readonly Transportista[] = ["MARESA", "RENUS"];

export const FRANJAS_RECOGIDA = [
  { id: "MANANA", label: "Mañana (9-14h)" },
  { id: "TARDE", label: "Tarde (14-18h)" },
  { id: "TODO_DIA", label: "Todo el día" },
] as const;
export type FranjaRecogida = (typeof FRANJAS_RECOGIDA)[number]["id"];
export const FRANJA_RECOGIDA_LABELS: Record<FranjaRecogida, string> = Object.fromEntries(
  FRANJAS_RECOGIDA.map((f) => [f.id, f.label])
) as Record<FranjaRecogida, string>;

export const TIPOS_BULTO = ["BULTO", "PALET"] as const;
export type TipoBulto = (typeof TIPOS_BULTO)[number];
export const TIPO_BULTO_LABELS: Record<TipoBulto, string> = {
  BULTO: "Bulto suelto",
  PALET: "Palet",
};

export const ESTADOS_ENVIO = [
  "PENDIENTE_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "RECIBIDO",
  "INCIDENCIA",
] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

// Ojo: "Pendiente de preparación" ya no lleva fijo "(FDM)" — puede ser
// cualquiera de los dos almacenes, o ninguno si es una recogida. El almacén
// concreto se muestra aparte, junto al origen/destino de cada movimiento.
export const ESTADO_ENVIO_LABELS: Record<EstadoEnvio, string> = {
  PENDIENTE_PREPARACION: "Pendiente de preparación",
  ENVIADO: "Enviado",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibido",
  INCIDENCIA: "Incidencia en envío",
};

export const TIPOS_INCIDENCIA = [
  "INSTALACION_NUEVA",
  "REPARACION",
  "MANTENIMIENTO",
] as const;
export type TipoIncidencia = (typeof TIPOS_INCIDENCIA)[number];

export const TIPO_INCIDENCIA_LABELS: Record<TipoIncidencia, string> = {
  INSTALACION_NUEVA: "Instalación nueva",
  REPARACION: "Reparación",
  MANTENIMIENTO: "Mantenimiento",
};

export const ESTADOS_INCIDENCIA = ["SIN_ASIGNAR", "ASIGNADA", "EN_CAMINO", "RESUELTA"] as const;
export type EstadoIncidencia = (typeof ESTADOS_INCIDENCIA)[number];

export const ESTADO_INCIDENCIA_LABELS: Record<EstadoIncidencia, string> = {
  SIN_ASIGNAR: "Sin asignar",
  ASIGNADA: "Asignada",
  EN_CAMINO: "En camino",
  RESUELTA: "Resuelta",
};
