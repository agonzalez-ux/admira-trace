import nodemailer from "nodemailer";

/**
 * Envío de correo por el relay SMTP de Google Workspace.
 *
 * `soporte.altadis@admira.com` es un GRUPO, no una cuenta: no tiene contraseña
 * y no puede autenticarse. El relay de Workspace (smtp-relay.gmail.com) está
 * pensado justo para esto — permite que una aplicación envíe como cualquier
 * dirección del dominio.
 *
 * Admite las dos formas de autorización que ofrece el relay:
 *  - Por IP: el admin autoriza la IP del servidor y no hacen falta credenciales.
 *  - Con cuenta: se autentica con un usuario real, pero el remitente sigue
 *    siendo el grupo (SMTP_FROM es independiente de SMTP_USER).
 *
 * Sin configurar, el envío se *simula* (queda como "SIMULADO") para que el
 * resto de la app siga funcionando con normalidad.
 */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || (SMTP_USER ? `Admira Trace <${SMTP_USER}>` : "");
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || "";

// El relay por IP no lleva usuario ni contraseña: basta con tener el host.
export const EMAIL_CONFIGURED = Boolean(SMTP_HOST && SMTP_FROM);

export type EmailResult = { estado: "ENVIADO" | "SIMULADO" | "ERROR"; detalle?: string };

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!EMAIL_CONFIGURED) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    // 465 usa TLS implícito; 587 empieza en claro y sube a TLS con STARTTLS.
    secure: SMTP_PORT === 465,
    // Solo se autentica si hay credenciales; si el relay autoriza por IP, se omite.
    ...(SMTP_USER && SMTP_PASSWORD ? { auth: { user: SMTP_USER, pass: SMTP_PASSWORD } } : {}),
  });
  return transporter;
}

export async function sendEmail(params: { to: string; subject: string; text: string }): Promise<EmailResult> {
  const t = getTransporter();

  if (!t) {
    console.log(`[email-simulado] Para: ${params.to}\nAsunto: ${params.subject}\n${params.text}\n`);
    return { estado: "SIMULADO" };
  }

  try {
    await t.sendMail({
      from: SMTP_FROM,
      replyTo: SMTP_REPLY_TO || undefined,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return { estado: "ENVIADO" };
  } catch (err: any) {
    return { estado: "ERROR", detalle: err?.message || String(err) };
  }
}

/** Comprueba que el relay acepta la conexión, sin enviar ningún correo. */
export async function verificarConexionSmtp(): Promise<{ ok: boolean; detalle?: string }> {
  const t = getTransporter();
  if (!t) return { ok: false, detalle: "Falta configurar SMTP_HOST / SMTP_FROM en el .env." };
  try {
    await t.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, detalle: err?.message || String(err) };
  }
}
