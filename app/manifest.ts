import type { MetadataRoute } from "next";

// Permite "instalar" la web en el móvil: icono en la pantalla de inicio y
// se abre a pantalla completa, como una app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reservas de clases",
    short_name: "Reservas",
    description: "Horario y reservas de clases de tu hípica.",
    lang: "es",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4ef",
    theme_color: "#1f4d3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
