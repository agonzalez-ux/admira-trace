import { prisma } from "./prisma";

// Los nombres de estanco en el directorio real siguen el patrón "CIUDAD-NNN"
// o "CIUDAD DE VARIAS PALABRAS-NNN" (ej. "MADRID-336", "SAN ANTONIO DE
// BENAGEBER-001"), y ese mismo código suele aparecer tal cual dentro del
// título del ticket del desk, pegado justo detrás del código interno del
// ticket (ej. "ITG14050074COR LUCENA-006 AV DEL PARQUE..."). Buscamos el
// token que termina en "-NNN" y probamos a combinarlo con las palabras
// (puramente alfabéticas) que lo preceden, de menos a más, hasta encontrar
// una coincidencia EXACTA en el directorio. Si no hay coincidencia exacta,
// no se inventa nada.
const TOKEN_TERMINA_EN_CODIGO = /^[A-ZÀ-ÖØ-Þ0-9ÑÁÉÍÓÚÜ'().]*-\d{2,5}$/i;
const PALABRA_ALFABETICA = /^[A-ZÀ-ÖØ-Þ ÑÁÉÍÓÚÜ'().]+$/i;
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
    if (!TOKEN_TERMINA_EN_CODIGO.test(tokens[i])) continue;

    // Probar primero solo este token, luego ir añadiendo palabras previas.
    for (let extra = 0; extra <= MAX_PALABRAS_PREVIAS; extra++) {
      const inicio = i - extra;
      if (inicio < 0) break;
      if (extra > 0 && !PALABRA_ALFABETICA.test(tokens[inicio])) break;

      const candidato = tokens.slice(inicio, i + 1).join(" ").trim();
      const estanco = await buscarEstancoExacto(candidato);
      if (estanco) return { estancoId: estanco.id, confianza: 1 };
    }
  }

  return null;
}
