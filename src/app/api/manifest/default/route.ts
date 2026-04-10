import { NextResponse } from 'next/server';

export async function GET() {
  const manifest = {
    name: "EVA",
    short_name: "EVA",
    description: "Plataforma de entrenamiento inteligente y gestión para coaches",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#10B981",
    icons: [
      {
        src: "/eva-app-icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/eva-app-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/eva-app-icon.png",
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
