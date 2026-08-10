import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

/**
 * Deduce el tipo de material a partir del código de barras.
 *
 * Los códigos internos siguen el patrón ALMACEN-TIPO-NNNN (p. ej. FDM-PANT-0001,
 * TEC-ROUT-0100), así que el segmento del medio identifica el tipo. También se
 * reconocen palabras sueltas por si el código viene con otro formato.
 */
const PISTAS: { patrones: string[]; tipo: string }[] = [
  { patrones: ["PANT", "TFT", "SCREEN", "DISPLAY", "MONITOR"], tipo: "PANTALLA" },
  { patrones: ["ROUT", "RTR", "ROUTER"], tipo: "ROUTER" },
  { patrones: ["REPR", "PLAYER", "BRIGHT", "MINIPC", "SHUTTLE", "PC"], tipo: "REPRODUCTOR" },
  { patrones: ["SOP", "SOPORTE", "BRACKET", "ANCLA"], tipo: "SOPORTE" },
  { patrones: ["CAB", "CABLE", "HDMI", "DP", "DISPLAYPORT"], tipo: "CABLEADO" },
  { patrones: ["MOB", "MUEBLE", "MOBIL"], tipo: "MOBILIARIO" },
];

function deducirTipo(codigo: string): string | null {
  const cod = codigo.toUpperCase();
  const segmentos = cod.split(/[-_\s]+/).filter(Boolean);

  // Primero por segmento exacto (el patrón habitual ALMACEN-TIPO-NNNN).
  for (const seg of segmentos) {
    for (const { patrones, tipo } of PISTAS) {
      if (patrones.includes(seg)) return tipo;
    }
  }
  // Si no, se busca la pista en cualquier parte del código.
  for (const { patrones, tipo } of PISTAS) {
    if (patrones.some((p) => p.length >= 3 && cod.includes(p))) return tipo;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIRA" && session.role !== "FDM")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const codigoBarras = (req.nextUrl.searchParams.get("codigoBarras") || "").trim();
  if (!codigoBarras) return NextResponse.json({ error: "Falta el código de barras." }, { status: 400 });

  // Si ya existe, se avisa: evita dar de alta dos veces la misma pieza.
  const existente = await prisma.material.findUnique({
    where: { codigoBarras },
    include: { tecnico: { select: { name: true } } },
  });
  if (existente) {
    return NextResponse.json({
      existe: true,
      material: {
        codigoBarras: existente.codigoBarras,
        tipo: existente.tipo,
        tipoPersonalizado: existente.tipoPersonalizado,
        nombre: existente.nombre,
        estado: existente.estado,
        tecnico: existente.tecnico?.name || null,
      },
    });
  }

  const tipoDeducido = deducirTipo(codigoBarras);

  // Para rellenar nombre y descripción se usa el último material real dado de
  // alta de ese mismo tipo: como se registran muchas piezas iguales, casi
  // siempre acierta. No se inventa nada: si no hay ninguno previo, va vacío.
  let sugerencia: { tipo: string | null; nombre: string; descripcion: string; basadoEn: string | null } = {
    tipo: tipoDeducido,
    nombre: "",
    descripcion: "",
    basadoEn: null,
  };

  if (tipoDeducido) {
    const referencia = await prisma.material.findFirst({
      where: { tipo: tipoDeducido },
      orderBy: { createdAt: "desc" },
    });
    if (referencia) {
      sugerencia.nombre = referencia.nombre;
      sugerencia.descripcion = referencia.descripcion || "";
      sugerencia.basadoEn = referencia.codigoBarras;
    }
  }

  return NextResponse.json({ existe: false, sugerencia });
}
