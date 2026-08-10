/**
 * Comprueba que las credenciales SMTP funcionan. Por defecto solo verifica la
 * conexión (no envía nada). Con un email como argumento, manda un correo de prueba.
 *
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/probar-smtp.ts
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/probar-smtp.ts destino@admira.com
 */
import { verificarConexionSmtp, sendEmail, EMAIL_CONFIGURED } from "../src/lib/email";

(async () => {
  if (!EMAIL_CONFIGURED) {
    console.error("Faltan SMTP_HOST / SMTP_USER / SMTP_PASSWORD en el .env");
    process.exit(1);
  }

  console.log(`Conectando a ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} como ${process.env.SMTP_USER}…`);
  const conexion = await verificarConexionSmtp();

  if (!conexion.ok) {
    console.error("❌ No se ha podido autenticar:", conexion.detalle);
    process.exit(1);
  }
  console.log("✅ Conexión y credenciales correctas.");

  const destino = process.argv[2];
  if (!destino) {
    console.log("(Sin destino: no se ha enviado ningún correo.)");
    return;
  }

  const r = await sendEmail({
    to: destino,
    subject: "Prueba de configuración — Admira Trace",
    text: `Este es un email de prueba de Admira Trace.

Si lo estás leyendo, el envío desde el buzón corporativo funciona.

A partir de ahora se enviarán solos:
- Aviso al comercial cuando un técnico programa la visita.
- Aviso al comercial cuando el técnico va de camino.
- Enlaces de "he olvidado mi contraseña".

Admira Trace`,
  });
  console.log("Resultado del envío:", JSON.stringify(r));
})();
