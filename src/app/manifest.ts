import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "TAVO · Gestão inteligente",
    short_name: "TAVO",
    description: "Seu restaurante em sintonia.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#101010",
    theme_color: "#111111",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
