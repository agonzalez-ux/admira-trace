import { prisma } from "./prisma";

// El código interno del ticket del desk (ej. "ITG18090357GRA") lleva pegados
// los 8 dígitos del propio `idEstanco` del directorio (ej. "18090357") — se
// comprobó contra 185 tickets reales y coincide en el 100% de los casos. Es
// el identificador más fiable que hay: se prueba antes que nada.
const CODIGO_ITG_EN_TEXTO = /ITG(\d{8})/;

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

// Último recurso cuando el título no trae ningún código reconocible: el desk
// casi siempre termina el título con el teléfono fijo del propio estanco (ej.
// "...CL REAL, 2 SVM FASE 2 958555152"). Si ese teléfono coincide con el de
// un único estanco del directorio, es un identificador tan fiable como el
// código — pero si lo comparte más de uno (pasa en ~0,4% de los casos, p.ej.
// un mismo dueño con varios locales), se descarta por seguridad.
const TELEFONO_EN_TEXTO = /\b\d{9}\b/g;

async function buscarEstancoExacto(nombre: string) {
  return prisma.estanco.findFirst({ where: { nombre } });
}

async function buscarEstancoPorTelefono(texto: string) {
  const telefonos = texto.match(TELEFONO_EN_TEXTO);
  if (!telefonos) return null;
  for (const telefono of telefonos) {
    const candidatos = await prisma.estanco.findMany({ where: { telefono }, take: 2 });
    if (candidatos.length === 1) return candidatos[0];
  }
  return null;
}

export async function matchEstanco(texto: string): Promise<{ estancoId: string; confianza: number } | null> {
  if (!texto) return null;

  const codigoItg = texto.match(CODIGO_ITG_EN_TEXTO);
  if (codigoItg) {
    const porItg = await prisma.estanco.findUnique({ where: { idEstanco: codigoItg[1] } });
    if (porItg) return { estancoId: porItg.id, confianza: 1 };
  }

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

  const porTelefono = await buscarEstancoPorTelefono(texto);
  if (porTelefono) return { estancoId: porTelefono.id, confianza: 0.9 };

  return null;
}
