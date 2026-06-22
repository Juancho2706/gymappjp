import { NextResponse } from 'next/server';
import { BRAND_APP_ICON_512, BRAND_APP_ICON_MASKABLE, BRAND_PRIMARY_COLOR } from '@/lib/brand-assets';

export async function GET() {
  const manifest = {
    name: "EVA",
    short_name: "EVA",
    description: "Plataforma de entrenamiento inteligente y gestión para coaches",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: BRAND_PRIMARY_COLOR,
    // Fallback EVA → archivos reales 512×512 (cuadrado `any` + maskable con safe-zone 80%,
    // no se recorta en Android), declarados SOLO a 512 para no mentir el size. Espeja el
    // fallback del manifest por-coach (api/manifest/[coach_slug]). Antes apuntaba al outline
    // tenue eva-icon.png en 192/512/maskable (maskable sin safe-zone → recorte en Android).
    icons: [
      { src: BRAND_APP_ICON_512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: BRAND_APP_ICON_MASKABLE, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
}
