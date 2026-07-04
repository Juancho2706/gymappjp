import { NextResponse } from 'next/server';
import { BRAND_APP_ICON_512, BRAND_APP_ICON_MASKABLE, BRAND_PRIMARY_COLOR } from '@/lib/brand-assets';
import { PWA_SCREENSHOT_SIZES } from '@/lib/pwa/screenshot-dimensions';

export async function GET() {
  const manifest = {
    // `id` estable ancla la identidad del PWA (espeja start_url); evita tratar reinstalaciones
    // como apps distintas.
    id: "/",
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
    ],
    // Screenshots del manifest → Richer Install UI de Android. `/api/pwa-screenshot/default` cae a
    // la marca EVA genérica (coach "default" inexistente). Mismas dimensiones EXACTAS que el manifest
    // per-coach (PWA_SCREENSHOT_SIZES) — requisito de Chrome para no descartar el richer UI.
    screenshots: [1, 2].map((v) => ({
      src: `/api/pwa-screenshot/default?v=${v}`,
      sizes: PWA_SCREENSHOT_SIZES,
      type: "image/png",
      form_factor: "narrow",
      label: v === 1 ? "Tu progreso, en un solo lugar" : "Tu plan de entrenamiento",
    })),
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
    },
  });
}
