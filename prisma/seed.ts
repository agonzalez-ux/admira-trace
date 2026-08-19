import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const tecnico = await prisma.user.upsert({
    where: { username: "tecnico" },
    update: { phone: "+34600111222", zona: "Madrid", direccion: "Calle Gran Vía 20, Madrid" },
    create: {
      username: "tecnico",
      password: hash("tecnico"),
      role: "TECNICO",
      name: "Carlos Ruiz",
      phone: "+34600111222",
      zona: "Madrid",
      direccion: "Calle Gran Vía 20, Madrid",
    },
  });

  const tecnico2 = await prisma.user.upsert({
    where: { username: "tecnico2" },
    update: { phone: "+34600333444", zona: "Sevilla", direccion: "Calle Betis 5, Sevilla" },
    create: {
      username: "tecnico2",
      password: hash("tecnico2"),
      role: "TECNICO",
      name: "Laura Gómez",
      phone: "+34600333444",
      zona: "Sevilla",
      direccion: "Calle Betis 5, Sevilla",
    },
  });

  const admira = await prisma.user.upsert({
    where: { username: "admira" },
    update: {},
    create: {
      username: "admira",
      password: hash("admira"),
      role: "ADMIRA",
      name: "Coordinación Admira",
    },
  });

  const fdm = await prisma.user.upsert({
    where: { username: "fdm" },
    update: {},
    create: {
      username: "fdm",
      password: hash("fdm"),
      role: "FDM",
      name: "Almacén FDM",
    },
  });

  const materialesData = [
    { numeroSerie: "FDM-PANT-0001", tipo: "PANTALLA", nombre: 'Pantalla LG 55" ', estado: "EN_FDM" },
    { numeroSerie: "FDM-PANT-0002", tipo: "PANTALLA", nombre: 'Pantalla LG 55" ', estado: "EN_FDM" },
    { numeroSerie: "FDM-ROUT-0001", tipo: "ROUTER", nombre: "Router Teltonika RUT240", estado: "EN_FDM" },
    { numeroSerie: "FDM-ROUT-0002", tipo: "ROUTER", nombre: "Router Teltonika RUT240", estado: "EN_FDM" },
    { numeroSerie: "FDM-REPR-0001", tipo: "REPRODUCTOR", nombre: "Reproductor BrightSign XT1145", estado: "EN_FDM" },
    {
      numeroSerie: "TEC-PANT-0100",
      tipo: "PANTALLA",
      nombre: 'Pantalla Samsung 43"',
      estado: "EN_TECNICO",
      tecnicoId: tecnico.id,
    },
    {
      numeroSerie: "TEC-ROUT-0100",
      tipo: "ROUTER",
      nombre: "Router Teltonika RUT240",
      estado: "EN_TECNICO",
      tecnicoId: tecnico.id,
    },
    {
      numeroSerie: "TEC2-PANT-0200",
      tipo: "PANTALLA",
      nombre: 'Pantalla LG 49"',
      estado: "EN_TECNICO",
      tecnicoId: tecnico2.id,
    },
  ];

  for (const m of materialesData) {
    await prisma.material.upsert({
      where: { numeroSerie: m.numeroSerie },
      update: {},
      create: m,
    });
  }

  const incidenciasCount = await prisma.incidencia.count();
  if (incidenciasCount === 0) {
    await prisma.incidencia.create({
      data: {
        ticketExternoId: "DESK-10234",
        titulo: "Pantalla sin señal en tienda Gran Vía",
        descripcion: "El cliente reporta que la pantalla del escaparate no enciende.",
        tipo: "REPARACION",
        cliente: "Estanco Gran Vía 45",
        direccion: "Gran Vía 45, Madrid",
        tecnicoId: tecnico.id,
        creadoPorId: admira.id,
        estado: "ASIGNADA",
      },
    });
    await prisma.incidencia.create({
      data: {
        ticketExternoId: "DESK-10240",
        titulo: "Instalación nueva punto de venta Triana",
        descripcion: "Instalación de pantalla + router en nuevo punto de venta.",
        tipo: "INSTALACION_NUEVA",
        cliente: "Estanco Triana",
        direccion: "Calle Betis 12, Sevilla",
        tecnicoId: tecnico2.id,
        creadoPorId: admira.id,
        estado: "ASIGNADA",
      },
    });
  }

  const enviosCount = await prisma.envio.count();
  if (enviosCount === 0) {
    const envio = await prisma.envio.create({
      data: {
        tipo: "ENVIO",
        transportista: "MARESA",
        origen: "Almacén FDM",
        destino: "Carlos Ruiz - Madrid",
        tecnicoId: tecnico.id,
        creadoPorId: admira.id,
        estado: "PENDIENTE_PREPARACION",
        notas: "Envío para reposición de stock recurrente.",
      },
    });
    const mat = await prisma.material.findUnique({ where: { numeroSerie: "FDM-PANT-0001" } });
    if (mat) {
      await prisma.envioItem.create({ data: { envioId: envio.id, materialId: mat.id } });
    }
  }

  console.log("Seed completado.");
  console.log("Usuarios demo:");
  console.log("  tecnico / tecnico (Carlos Ruiz, Madrid)");
  console.log("  tecnico2 / tecnico2 (Laura Gómez, Sevilla)");
  console.log("  admira / admira");
  console.log("  fdm / fdm");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
