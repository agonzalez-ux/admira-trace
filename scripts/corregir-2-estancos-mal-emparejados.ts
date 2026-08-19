/**
 * Corrección puntual de 2 incidencias que el emparejador antiguo (por nombre)
 * vinculó a un estanco equivocado, detectadas al comparar contra el código
 * ITG del ticket (ver commit "Emparejar estancos por código ITG y teléfono").
 * No toca nada más: solo estas 2, identificadas por su título exacto.
 */
import { prisma } from "../src/lib/prisma";

const CASOS = [
  { contieneTitulo: "ITG10060093CAC JARAIZ DE LA VERA-002", idEstancoCorrecto: "10060093" },
  { contieneTitulo: "ITG46003281VAL PATERNA-001", idEstancoCorrecto: "46003281" },
];

async function main() {
  for (const caso of CASOS) {
    const inc = await prisma.incidencia.findFirst({
      where: { titulo: { contains: caso.contieneTitulo } },
      include: { estanco: true },
    });
    if (!inc) {
      console.log(`[omitido] No se encontró ninguna incidencia con "${caso.contieneTitulo}"`);
      continue;
    }
    const correcto = await prisma.estanco.findUnique({ where: { idEstanco: caso.idEstancoCorrecto } });
    if (!correcto) {
      console.log(`[error] No existe el estanco idEstanco=${caso.idEstancoCorrecto}`);
      continue;
    }
    if (inc.estancoId === correcto.id) {
      console.log(`[ya correcto] ${inc.titulo.slice(0, 60)} ya está vinculada a ${correcto.idEstanco} ${correcto.nombre}`);
      continue;
    }
    console.log(
      `[corrigiendo] ${inc.titulo.slice(0, 60)}\n  antes: ${inc.estanco?.idEstanco} ${inc.estanco?.nombre}\n  ahora: ${correcto.idEstanco} ${correcto.nombre}`
    );
    await prisma.incidencia.update({
      where: { id: inc.id },
      data: { estancoId: correcto.id, estancoMatchConfianza: 1 },
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
