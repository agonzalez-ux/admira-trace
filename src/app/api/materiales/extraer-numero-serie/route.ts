import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/materiales/extraer-numero-serie
 * Extrae el número de serie de una foto del material usando visión.
 * Acepta imagen en base64 o como FormData.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "TECNICO") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  try {
    let imagenBase64: string;

    // Detectar si es FormData o JSON
    const contentType = req.headers.get("content-type");

    if (contentType?.includes("multipart/form-data")) {
      // FormData con archivo
      const formData = await req.formData();
      const archivo = formData.get("imagen") as File;

      if (!archivo) {
        return NextResponse.json(
          { error: "No se subió ninguna imagen." },
          { status: 400 }
        );
      }

      const buffer = await archivo.arrayBuffer();
      imagenBase64 = Buffer.from(buffer).toString("base64");
    } else {
      // JSON con base64
      const body = await req.json();
      imagenBase64 = body.imagenBase64;

      if (!imagenBase64) {
        return NextResponse.json(
          { error: "Falta imagenBase64 en el body." },
          { status: 400 }
        );
      }
    }

    // Llamar a Claude Vision para extraer el número de serie
    const client = new Anthropic();

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imagenBase64,
              },
            },
            {
              type: "text",
              text: `Analiza esta foto de material/equipamiento y extrae el número de serie, código de referencia o identificador único visible.

RESPONDE SOLO CON:
- Si encuentras un número de serie: "SERIE: [número]"
- Si encuentras un código de referencia: "CODIGO: [código]"
- Si encuentras un código de barras/QR legible: "QR: [contenido]"
- Si no encuentras nada: "NO_ENCONTRADO"

No incluyas explicaciones, solo la respuesta.`,
            },
          ],
        },
      ],
    });

    const respuesta = response.content[0];
    if (respuesta.type !== "text") {
      return NextResponse.json(
        { error: "Respuesta inesperada del servidor de visión" },
        { status: 500 }
      );
    }

    const texto = respuesta.text.trim().toUpperCase();

    // Parsear respuesta
    let numeroSerie = null;
    let tipo = null;

    if (texto.startsWith("SERIE:")) {
      numeroSerie = texto.replace("SERIE:", "").trim();
      tipo = "serie";
    } else if (texto.startsWith("CODIGO:")) {
      numeroSerie = texto.replace("CODIGO:", "").trim();
      tipo = "codigo";
    } else if (texto.startsWith("QR:")) {
      numeroSerie = texto.replace("QR:", "").trim();
      tipo = "qr";
    } else if (texto === "NO_ENCONTRADO") {
      return NextResponse.json(
        {
          error: "No se encontró número de serie en la foto",
          sugerencia: "Asegúrate de que la foto muestre claramente la etiqueta con el número de serie",
        },
        { status: 400 }
      );
    }

    console.log(
      `[extraer-numero-serie] Encontrado ${tipo}: "${numeroSerie}" (usuario: ${session.userId})`
    );

    return NextResponse.json({
      ok: true,
      numeroSerie,
      tipo,
      mensaje: `Número de ${tipo} extraído correctamente`,
    });
  } catch (err) {
    console.error("[extraer-numero-serie] Error:", err);

    // Si es error de autenticación de Anthropic
    if (err instanceof Error && err.message.includes("401")) {
      return NextResponse.json(
        {
          error: "Error de configuración del servidor de visión",
          detalles: "Verifica que ANTHROPIC_API_KEY esté configurada",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Error extrayendo número de serie: " + (err instanceof Error ? err.message : "desconocido"),
      },
      { status: 500 }
    );
  }
}
