const raw = process.env.JWT_SECRET;
if (!raw) {
  throw new Error(
    "JWT_SECRET no está definida: sin ella la app firmaría/verificaría sesiones con una clave adivinable. Defínela en el entorno antes de arrancar."
  );
}

export const JWT_SECRET = new TextEncoder().encode(raw);
