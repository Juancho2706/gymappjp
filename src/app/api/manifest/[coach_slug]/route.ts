import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ coach_slug: string }> | { coach_slug: string }; }
) {
  // Manejo de promesa en `params` (Next.js 15+)
  const resolvedParams = await Promise.resolve(params);
  const slug = resolvedParams.coach_slug;

  const supabase = createClient();

  const { data: coach } = await ((await supabase) as any)
    .from('coaches')
    .select('brand_name, logo_url, primary_color')
    .eq('slug', slug)
    .single();

  const manifest = {
    name: coach?.brand_name || "EVA",
    short_name: coach?.brand_name || "EVA",
    description: `Entrena con ${coach?.brand_name || 'tu coach'}`,
    start_url: `/c/${slug}/dashboard`,
    display: "standalone",
    background_color: "#000000",
    theme_color: coach?.primary_color || "#000000",
    icons: [
      {
        src: coach?.logo_url || "/eva-app-icon.png",
        sizes: "192x192",
        type: coach?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "any"
      },
      {
        src: coach?.logo_url || "/eva-app-icon.png",
        sizes: "512x512",
        type: coach?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "any"
      },
      {
        src: coach?.logo_url ? coach.logo_url : "/eva-app-icon.png",
        sizes: "192x192",
        type: coach?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "maskable"
      },
      {
        src: coach?.logo_url ? coach.logo_url : "/eva-app-icon.png",
        sizes: "512x512",
        type: coach?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, max-age=0'
    },
  });
}
