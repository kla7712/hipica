import type { NextConfig } from "next";

// Cabeceras de seguridad para todas las páginas.
const cabecerasSeguridad = [
  // Nadie puede meter la app dentro de un iframe (evita "clickjacking").
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // El navegador no adivina tipos de archivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir a otra web no se envía la URL completa (que puede llevar tokens).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La app no usa cámara, micrófono ni ubicación.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Solo HTTPS durante 2 años.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
