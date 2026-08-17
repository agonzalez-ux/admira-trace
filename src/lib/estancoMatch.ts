import { prisma } from "./prisma";

// Los nombres de estanco en el directorio real siguen el patrón "CIUDAD-NNN"
// o "CIUDAD DE VARIAS PALABRAS-NNN" (ej. "MADRID-336", "SAN ANTONIO DE
// BENAGEBER-001"), y ese mismo código suele aparecer tal cual dentro del
// título del ticket del desk, pegado justo detrás del código interno del
// ticket (ej. "ITG14050074COR LUCENA-006 AV DEL PARQUE..."). Buscamos el
// token que EMPIEZA por "...-NNN" y probamos a combinarlo con las palabras
// que lo preceden, de menos a más, hasta encontrar una coincidencia EXACTA
// en el directorio. Si no hay coincidencia exacta, no se inventa nada.
//
// OJO: el código NO siempre está al final del token — el desk suele pegar
// directamente detrás el tipo de vía sin espacio (ej. "SALOBREÑA-001-CL",
// "MASSANASSA-002CL"), así que se busca el código al PRINCIPIO del token y
// se descarta lo que venga después. Y las palabras previas pueden llevar
// guión interno (ej. "SANCTI PETRI-LA BARROSA-002"), así que no se exige que
// sean puramente alfabéticas, solo que no contengan otros caracteres raros.
const CODIGO_AL_INICIO_DE_TOKEN = /^([A-ZÀ-ÖØ-Þ0-9ÑÁÉÍÓÚÜ'().]*-\d{2,5})/i;
const PALABRA_PREVIA_VALIDA = /^[A-ZÀ-ÖØ-Þ ÑÁÉÍÓÚÜ'().-]+$/i;
const MAX_PALABRAS_PREVIAS = 4;

async function buscarEstancoExacto(nombre: string) {
  return prisma.estanco.findFirst({ where: { nombre } });
}

export async function matchEstanco(texto: string): Promise<{ estancoId: string; confianza: number } | null> {
  if (!texto) return null;

  const tokens = texto
    .toUpperCase()
    .replace(/[,]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (let i = 0; i < tokens.length; i++) {
    const match = tokens[i].match(CODIGO_AL_INICIO_DE_TOKEN);
    if (!match) continue;
    const tokenCodigo = match[1];

    // Probar primero solo este código, luego ir añadiendo palabras previas.
    for (let extra = 0; extra <= MAX_PALABRAS_PREVIAS; extra++) {
      const inicio = i - extra;
      if (inicio < 0) break;
      if (extra > 0 && !PALABRA_PREVIA_VALIDA.test(tokens[inicio])) break;

      const candidato = [...tokens.slice(inicio, i), tokenCodigo].join(" ").trim();
      const estanco = await buscarEstancoExacto(candidato);
      if (estanco) return { estancoId: estanco.id, confianza: 1 };
    }
  }

  return null;
}
