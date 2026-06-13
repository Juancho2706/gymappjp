import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin-client';
import { BRAND_APP_ICON } from '@/lib/brand-assets';

type ManifestBrand = {
  brand_name: string
  logo_url: string | null
  primary_color: string | null
  // Cuando el alumno es de pool (clients.team_id NO NULL, org_id NULL), el manifest
  // se ancla al árbol /t/[team_slug]; en standalone/org queda NULL y se usa /c/[slug].
  team_slug?: string | null
  // Fondo del splash del team (espeja el route de imagen /api/splash). Solo se rellena
  // para alumnos de pool; en standalone/org queda NULL y el background cae al negro.
  splash_bg_color?: string | null
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

  // Alumno de pool: anclar el PWA al árbol /t/[team_slug] (start_url + scope), nunca a /c.
  const teamSlug = brand?.team_slug ?? null
  const startUrl = teamSlug ? `/t/${teamSlug}/dashboard` : `/c/${slug}/dashboard`
  const scope = teamSlug ? `/t/${teamSlug}` : `/c/${slug}`

  // Background del splash: para alumno de pool espeja el route de imagen /api/splash
  // (splash_bg_color del team, si no su primary_color); coach/org mantiene el negro.
  const backgroundColor = teamSlug
    ? (brand?.splash_bg_color ?? brand?.primary_color ?? "#000000")
    : "#000000"

  const manifest = {
    name: brand?.brand_name || "EVA",
    short_name: brand?.brand_name || "EVA",
    description: `Entrena con ${brand?.brand_name || 'tu coach'}`,
    start_url: startUrl,
    scope,
    display: "standalone",
    background_color: backgroundColor,
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
    .select('coach_id, org_id, team_id')
    .eq('id', user.id)
    .maybeSingle()

  // Alumno de pool (team_id set, org_id NULL): resolver la marca del TEAM (centro),
  // nunca la marca personal del coach. teams no tiene SELECT anon → service-role.
  if (client?.team_id && !client.org_id) {
    const admin = createServiceRoleClient()
    const { data: team } = await admin
      .from('teams')
      .select('slug, name, logo_url, primary_color, splash_bg_color')
      .eq('id', client.team_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!team) return coach
    return {
      brand_name: team.name ?? coach.brand_name,
      logo_url: team.logo_url ?? coach.logo_url,
      primary_color: team.primary_color ?? coach.primary_color,
      team_slug: team.slug,
      splash_bg_color: team.splash_bg_color,
    }
  }

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
