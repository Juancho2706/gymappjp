import { NextResponse } from 'next/server';

export async function GET() {
  const manifest = {
    name: "COACH OP",
    short_name: "COACH OP",
    description: "Plataforma de entrenamiento inteligente y gestión para coaches",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#10B981",
    icons: [
      {
        src: "/LOGO CUADRADO FINAL FONDO NEGRO.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/LOGO CUADRADO FINAL FONDO NEGRO.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable.png", // Requiere un icono con 20% de padding para Android
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
}
