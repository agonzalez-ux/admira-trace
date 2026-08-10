-- CreateTable
CREATE TABLE "Estanco" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idEstanco" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "municipio" TEXT,
    "codigoPostal" TEXT,
    "provincia" TEXT,
    "telefono" TEXT,
    "zona" TEXT,
    "frecuencia" TEXT,
    "segmento" TEXT,
    "comercial" TEXT,
    "telefonoComercial" TEXT,
    "comentarioComercial" TEXT,
    "correoComercial" TEXT,
    "lat" REAL,
    "lon" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "zona" TEXT,
    "direccion" TEXT,
    "codigoPostal" TEXT,
    "personaContacto" TEXT,
    "horario" TEXT,
    "radioCobertura" TEXT,
    "costeKm" TEXT,
    "condiciones" TEXT,
    "lat" REAL,
    "lon" REAL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordCambiadaAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiraAt" DATETIME NOT NULL,
    "usadoAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenRecurrente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tecnicoId" TEXT NOT NULL,
    "frecuenciaDias" INTEGER NOT NULL,
    "transportista" TEXT NOT NULL DEFAULT 'MARESA',
    "materialConfig" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "ultimaEjecucion" DATETIME,
    "proximaEjecucion" DATETIME NOT NULL,
    "creadoPorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrdenRecurrente_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrdenRecurrente_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigoBarras" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tipoPersonalizado" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "numeroSerie" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_FDM',
    "tecnicoId" TEXT,
    "ubicacion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Material_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialEvento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" TEXT,
    "envioId" TEXT,
    "incidenciaId" TEXT,
    "notas" TEXT,
    CONSTRAINT "MaterialEvento_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaterialEvento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Envio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tipo" TEXT NOT NULL DEFAULT 'ENVIO',
    "transportista" TEXT NOT NULL DEFAULT 'MARESA',
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "tecnicoId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE_PREPARACION',
    "esRecurrente" BOOLEAN NOT NULL DEFAULT false,
    "ordenRecurrenteId" TEXT,
    "notas" TEXT,
    "creadoPorId" TEXT,
    "fechaCreacion" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEnviado" DATETIME,
    "fechaRecibido" DATETIME,
    CONSTRAINT "Envio_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Envio_ordenRecurrenteId_fkey" FOREIGN KEY ("ordenRecurrenteId") REFERENCES "OrdenRecurrente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Envio_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EnvioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "envioId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "escaneadoOrigen" BOOLEAN NOT NULL DEFAULT false,
    "fechaEscaneoOrigen" DATETIME,
    "escaneadoDestino" BOOLEAN NOT NULL DEFAULT false,
    "fechaEscaneoDestino" DATETIME,
    CONSTRAINT "EnvioItem_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "Envio" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EnvioItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Incidencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketExternoId" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "deskTicketId" TEXT,
    "deskProyecto" TEXT,
    "deskEstado" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'REPARACION',
    "cliente" TEXT,
    "direccion" TEXT,
    "tecnicoId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ASIGNADA',
    "creadoPorId" TEXT,
    "fechaAsignacion" DATETIME,
    "fechaEnCamino" DATETIME,
    "fechaResuelta" DATETIME,
    "fechaImportada" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estancoId" TEXT,
    "estancoMatchConfianza" REAL,
    "fechaVisitaProgramada" DATETIME,
    "comercialAvisadoProgramada" BOOLEAN NOT NULL DEFAULT false,
    "comercialAvisadoEnCamino" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Incidencia_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Incidencia_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Incidencia_estancoId_fkey" FOREIGN KEY ("estancoId") REFERENCES "Estanco" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificacionComercial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidenciaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "destinatario" TEXT,
    "estado" TEXT NOT NULL,
    "detalle" TEXT,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificacionComercial_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "Incidencia" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FotoEvidencia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidenciaId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FotoEvidencia_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "Incidencia" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncidenciaMaterial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incidenciaId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidenciaMaterial_incidenciaId_fkey" FOREIGN KEY ("incidenciaId") REFERENCES "Incidencia" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncidenciaMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Estanco_idEstanco_key" ON "Estanco"("idEstanco");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Material_codigoBarras_key" ON "Material"("codigoBarras");

-- CreateIndex
CREATE UNIQUE INDEX "Incidencia_deskTicketId_key" ON "Incidencia"("deskTicketId");

