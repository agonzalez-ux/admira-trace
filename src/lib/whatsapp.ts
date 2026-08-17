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
 * Genera el mensaje de WhatsApp que el propio técnico envía a Admira al
 * terminar una instalación, adjuntando la foto del QR. Va en primera
 * persona porque quien lo manda es el técnico, no un tercero avisándole.
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
  const tecnico = tecnicoNombre || '(técnico sin nombre)';
  const estanco = estancoNombre ? `${estancoNombre}` : '(sin estanco vinculado)';
  const direccion = estancoDireccion ? ` - ${estancoDireccion}` : '';

  return `👋 Hola, soy *${tecnico}*.

He terminado la instalación en *${estanco}${direccion}*.

Os adjunto la foto del QR de Admira.

Gracias.`;
}
