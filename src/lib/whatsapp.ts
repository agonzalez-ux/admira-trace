/**
 * Gestión de números de WhatsApp para instalaciones.
 * Alterna entre 3 números para evitar saturación.
 */

const NUMEROS_WHATSAPP = [
  '+34 640 80 69 28',
  '+34 689 35 89 00',
  '+34 685 93 59 68',
];

/**
 * Obtiene el siguiente número de WhatsApp usando un índice basado en hash.
 * De esta forma, incidencias similares siempre van al mismo número,
 * pero se distribuyen entre los 3.
 */
export function obtenerNumeroWhatsAppRotativo(incidenciaId: string): string {
  // Hash simple del ID para distribución consistente
  let hash = 0;
  for (let i = 0; i < incidenciaId.length; i++) {
    const char = incidenciaId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  const indice = Math.abs(hash) % NUMEROS_WHATSAPP.length;
  return NUMEROS_WHATSAPP[indice];
}

/**
 * Genera el mensaje de WhatsApp para una instalación.
 * Incluye técnico, estanco, tipo de trabajo y solicitud de QR.
 */
export function generarMensajeInstalacion({
  tecnicoNombre,
  estancoNombre,
  estancoDireccion,
}: {
  tecnicoNombre?: string;
  estancoNombre?: string;
  estancoDireccion?: string;
}): string {
  const tecnico = tecnicoNombre || '(Sin técnico asignado)';
  const estanco = estancoNombre ? `${estancoNombre}` : '(Sin estanco vinculado)';
  const direccion = estancoDireccion ? ` - ${estancoDireccion}` : '';

  return `👋 Hola,

El técnico *${tecnico}* está realizando una instalación en *${estanco}${direccion}*.

Por favor, procede a pasar la foto del QR de Admira.

Gracias.`;
}
