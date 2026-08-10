export const ROLES = ["TECNICO", "ADMIRA", "FDM"] as const;
export type Rol = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Rol, string> = {
  TECNICO: "Técnico",
  ADMIRA: "Admira",
  FDM: "FDM",
};

export const TIPOS_MATERIAL = [
  "PANTALLA",
  "ROUTER",
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

export const TIPOS_ENVIO = ["ENVIO", "RECOGIDA"] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];

export const TRANSPORTISTAS = ["MARESA", "RENUS", "OTRO"] as const;
export type Transportista = (typeof TRANSPORTISTAS)[number];

export const ESTADOS_ENVIO = [
  "PENDIENTE_PREPARACION",
  "ENVIADO",
  "EN_TRANSITO",
  "RECIBIDO",
  "INCIDENCIA",
] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

export const ESTADO_ENVIO_LABELS: Record<EstadoEnvio, string> = {
  PENDIENTE_PREPARACION: "Pendiente de preparación (FDM)",
  ENVIADO: "Enviado por FDM",
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
