import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BRAND_APP_ICON } from '@/lib/brand-assets';

type ManifestBrand = {
  brand_name: string
  logo_url: string | null
  primary_color: string | null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ coach_slug: string }> | { coach_slug: string }; }
) {
  // Manejo de promesa en `params` (Next.js 15+)
  const resolvedParams = await Promise.resolve(params);
  const slug = resolvedParams.coach_slug;

  const supabase = await createClient();

  // Gap 7: support invite_code (5 uppercase chars) in addition to slug
  const INVITE_CODE_RE = /^[A-Z2-9]{5}$/
  const coachQuery = supabase.from('coaches').select('id, brand_name, logo_url, primary_color')
  const { data: coach } = await (
    INVITE_CODE_RE.test(slug)
      ? coachQuery.eq('invite_code', slug).maybeSingle()
      : coachQuery.eq('slug', slug).maybeSingle()
  )

  const brand = coach ? await resolveManifestBrand(supabase, coach) : null

  const manifest = {
    name: brand?.brand_name || "EVA",
    short_name: brand?.brand_name || "EVA",
    description: `Entrena con ${brand?.brand_name || 'tu coach'}`,
    start_url: `/c/${slug}/dashboard`,
    display: "standalone",
    background_color: "#000000",
    theme_color: brand?.primary_color || "#000000",
    icons: [
      {
        src: brand?.logo_url || BRAND_APP_ICON,
        sizes: "192x192",
        type: brand?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "any"
      },
      {
        src: brand?.logo_url || BRAND_APP_ICON,
        sizes: "512x512",
        type: brand?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "any"
      },
      {
        src: brand?.logo_url ? brand.logo_url : BRAND_APP_ICON,
        sizes: "192x192",
        type: brand?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "maskable"
      },
      {
        src: brand?.logo_url ? brand.logo_url : BRAND_APP_ICON,
        sizes: "512x512",
        type: brand?.logo_url?.endsWith('.svg') ? "image/svg+xml" : "image/png",
        purpose: "maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
    },
  });
}

async function resolveManifestBrand(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coach: ManifestBrand & { id: string }
): Promise<ManifestBrand> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return coach

  const { data: client } = await supabase
    .from('clients')
    .select('coach_id, org_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!client?.org_id) return coach

  let isDirectOrOrgCoach = client.coach_id === coach.id
  if (!isDirectOrOrgCoach) {
    const { data: orgMember } = await supabase
      .from('organization_members')
      .select('id')
      .eq('org_id', client.org_id)
      .eq('coach_id', coach.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()
    isDirectOrOrgCoach = Boolean(orgMember)
  }

  if (!isDirectOrOrgCoach) return coach

  const { data: org } = await supabase
    .from('organizations')
    .select('name, logo_url, primary_color')
    .eq('id', client.org_id)
    .maybeSingle()

  if (!org) return coach
  return {
    brand_name: org.name ?? coach.brand_name,
    logo_url: org.logo_url ?? coach.logo_url,
    primary_color: org.primary_color ?? coach.primary_color,
  }
}
