import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Directorio (fuera de `public/` y de cualquier ruta servida por la app)
 * donde vive la única copia en texto plano de la contraseña ACTUAL de cada
 * cuenta. Se captura aquí porque en la base de datos solo se guarda el hash
 * bcrypt — en cuanto alguien cambia su contraseña, la anterior es
 * irrecuperable para siempre.
 *
 * Este fichero es la fuente de la carpeta "Secreto" cifrada que sube el
 * backup diario a Drive (ver backup/README.md). En el propio VPS debe quedar
 * en un volumen persistente con permisos 600 — nunca se commitea.
 */
const VAULT_DIR = process.env.SECRETO_DIR
  ? path.resolve(process.env.SECRETO_DIR)
  : path.join(process.cwd(), "data", "secreto");
const VAULT_FILE = path.join(VAULT_DIR, "credenciales-vault.tsv");
const CABECERA = "usuario\tnombre\trol\temail\tpassword\tfecha";

/**
 * Da de alta o actualiza (upsert por `usuario`) la contraseña en texto plano
 * de una cuenta, justo en el momento en que se establece — antes de
 * hashearla. Nunca lanza: un fallo aquí no debe romper el alta/cambio de
 * contraseña real que lo desencadenó (mismo criterio que crearNotificacion()
 * en notificaciones.ts).
 */
export async function registrarCredencial({
  usuario,
  nombre,
  rol,
  email,
  password,
}: {
  usuario: string;
  nombre: string;
  rol: string;
  email: string | null;
  password: string;
}): Promise<void> {
  try {
    await mkdir(VAULT_DIR, { recursive: true, mode: 0o700 });

    const filas = new Map<string, string>();
    try {
      const actual = await readFile(VAULT_FILE, "utf-8");
      for (const linea of actual.split("\n").slice(1)) {
        const usuarioExistente = linea.split("\t")[0];
        if (usuarioExistente) filas.set(usuarioExistente, linea);
      }
    } catch {
      // Primera vez: el fichero aún no existe.
    }

    filas.set(usuario, [usuario, nombre, rol, email || "", password, new Date().toISOString()].join("\t"));

    const contenido = [CABECERA, ...filas.values()].join("\n") + "\n";
    await writeFile(VAULT_FILE, contenido, { mode: 0o600 });
  } catch (err) {
    console.error("[credenciales-vault] Error registrando credencial:", err);
  }
}
