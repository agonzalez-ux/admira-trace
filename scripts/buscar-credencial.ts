import path from "path";
import { readFile } from "fs/promises";
import { prisma } from "../src/lib/prisma";

/**
 * Busca en la base de datos (por nombre o username) y en el vault de
 * contraseñas en texto plano (ver src/lib/credencialesVault.ts) las cuentas
 * que coincidan, para poder dar la contraseña VIGENTE de una cuenta ya
 * existente sin tener que resetearla. No inventa nada: si el vault no tiene
 * una fila para ese usuario (cuenta creada antes de que existiera el vault,
 * o vault perdido), lo dice explícitamente en vez de dar un dato erróneo.
 *
 * Uso:
 *   docker build --target builder -t admira-builder-temp .
 *   docker run --rm \
 *     -v admira-trace_admira-db:/data -e DATABASE_URL="file:/data/admira-trace.db" \
 *     -v /data/secreto:/data/secreto -e SECRETO_DIR=/data/secreto \
 *     admira-builder-temp npx tsx scripts/buscar-credencial.ts "01 informatica"
 *   docker rmi admira-builder-temp
 */
const termino = (process.argv[2] || "").trim().toLowerCase();

async function main() {
  if (!termino) {
    console.error('Uso: npx tsx scripts/buscar-credencial.ts "texto a buscar"');
    process.exit(1);
  }

  const usuarios = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: termino } },
        { username: { contains: termino } },
      ],
    },
    select: { username: true, name: true, role: true, email: true, active: true },
  });

  if (usuarios.length === 0) {
    console.log(`No hay ninguna cuenta cuyo nombre o usuario contenga "${termino}".`);
    return;
  }

  const vaultDir = process.env.SECRETO_DIR ? path.resolve(process.env.SECRETO_DIR) : path.join(process.cwd(), "data", "secreto");
  const vaultFile = path.join(vaultDir, "credenciales-vault.tsv");
  const passwordsPorUsuario = new Map<string, string>();
  try {
    const contenido = await readFile(vaultFile, "utf-8");
    for (const linea of contenido.split("\n").slice(1)) {
      const [usuario, , , , password] = linea.split("\t");
      if (usuario) passwordsPorUsuario.set(usuario, password || "");
    }
  } catch {
    console.warn(`⚠️  No se pudo leer el vault en ${vaultFile}.`);
  }

  console.log(`Cuentas encontradas para "${termino}":\n`);
  for (const u of usuarios) {
    const password = passwordsPorUsuario.get(u.username);
    console.log(
      `- ${u.username} (${u.role}, ${u.name}${u.active ? "" : " — INACTIVA"}) → ${
        password ? `contraseña: ${password}` : "sin contraseña registrada en el vault (probablemente ya la cambió, o es anterior al vault)"
      }`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
