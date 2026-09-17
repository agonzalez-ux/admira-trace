/**
 * Corrección puntual de incidencias que el emparejador antiguo (por nombre)
 * vinculó a un estanco equivocado, detectadas al comparar contra el código
 * ITG del ticket (ver commit "Emparejar estancos por código ITG y teléfono").
 *
 * OJO: se filtra explícitamente por origen "DESK" — el mismo texto puede
 * aparecer también en una incidencia de origen "HARDWARE" (monitorización de
 * pantallas), que es una incidencia distinta aunque hable del mismo estanco.
 * findFirst sin este filtro puede coger la incorrecta.
 */
import { prisma } from "../src/lib/prisma";

const CASOS = [
  { contieneTitulo: "ITG10060093CAC JARAIZ DE LA VERA-002", idEstancoCorrecto: "10060093" },
  { contieneTitulo: "ITG46003281VAL PATERNA-001", idEstancoCorrecto: "46003281" },
];

async function main() {
  for (const caso of CASOS) {
    const incidencias = await prisma.incidencia.findMany({
      where: { origen: "DESK", titulo: { contains: caso.contieneTitulo } },
      include: { estanco: true },
    });
    if (incidencias.length === 0) {
      console.log(`[omitido] No se encontró ninguna incidencia DESK con "${caso.contieneTitulo}"`);
      continue;
    }
    const correcto = await prisma.estanco.findUnique({ where: { idEstanco: caso.idEstancoCorrecto } });
    if (!correcto) {
      console.log(`[error] No existe el estanco idEstanco=${caso.idEstancoCorrecto}`);
      continue;
    }
    for (const inc of incidencias) {
      if (inc.estancoId === correcto.id) {
        console.log(`[ya correcto] ${inc.titulo.slice(0, 60)} ya está vinculada a ${correcto.idEstanco} ${correcto.nombre}`);
        continue;
      }
      console.log(
        `[corrigiendo DESK] ${inc.titulo.slice(0, 60)}\n  antes: ${inc.estanco?.idEstanco || "(sin estanco)"} ${inc.estanco?.nombre || ""}\n  ahora: ${correcto.idEstanco} ${correcto.nombre}`
      );
      await prisma.incidencia.update({
        where: { id: inc.id },
        data: { estancoId: correcto.id, estancoMatchConfianza: 1 },
      });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
