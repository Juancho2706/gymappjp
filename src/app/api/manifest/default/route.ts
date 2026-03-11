import { NextResponse } from 'next/server';

export async function GET() {
  const manifest = {
    name: "OmniCoach OS",
    short_name: "OmniCoach",
    description: "Plataforma de entrenamiento inteligente",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/globe.svg",
        sizes: "192x192",
        type: "image/svg+xml"
      },
      {
        src: "/globe.svg",
        sizes: "512x512",
        type: "image/svg+xml"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
}
