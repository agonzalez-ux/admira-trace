/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Genera un servidor autocontenido en .next/standalone: la imagen de Docker
  // queda mucho más pequeña y no necesita node_modules completo.
  output: "standalone",
};

export default nextConfig;
