import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/admin-client';
import { BRAND_APP_ICON_512, BRAND_APP_ICON_MASKABLE } from '@/lib/brand-assets';
import { resolveBrandTheme } from '@eva/brand-kit';
import { PWA_SCREENSHOT_SIZES } from '@/lib/pwa/screenshot-dimensions';

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

  // Background del splash nativo: para alumno de pool espeja el route de imagen /api/splash
  // (splash_bg_color del team, si no su primary_color). Coach/org: la SUPERFICIE CLARA del
  // tema derivada del color de marca (mismo motor que el layout del alumno), en vez del negro
  // genérico fijo → el splash de instalación deja de ser negro.
  const backgroundColor = teamSlug
    ? (brand?.splash_bg_color ?? brand?.primary_color ?? "#000000")
    : deriveSplashBackground(brand?.primary_color)

  // Screenshots del manifest → Richer Install UI de Android. Generadas al vuelo con next/og
  // (composiciones brandeadas, NO capturas reales; ver /api/pwa-screenshot). Ambas variantes
  // comparten dimensiones EXACTAS (PWA_SCREENSHOT_SIZES) — si difirieran, Chrome descarta todo el
  // richer UI en silencio. Apuntan al `slug` de la URL (el route resuelve marca coach/team igual
  // que este manifest). El `description` de arriba ya alimenta el copy del diálogo.
  const screenshots = [1, 2].map((v) => ({
    src: `/api/pwa-screenshot/${slug}?v=${v}`,
    sizes: PWA_SCREENSHOT_SIZES,
    type: "image/png",
    form_factor: "narrow",
    label: v === 1 ? `Tu progreso con ${brand?.brand_name || 'tu coach'}` : `Tu plan de entrenamiento`,
  }));

  const manifest = {
    // `id` estable: sin `id`, Chrome usa el start_url como identidad — lo espejamos EXPLÍCITO
    // para no cambiar la identidad de PWAs ya instaladas (id distinto = app "nueva" al reinstalar).
    id: startUrl,
    name: brand?.brand_name || "EVA",
    short_name: brand?.brand_name || "EVA",
    description: `Entrena con ${brand?.brand_name || 'tu coach'}`,
    start_url: startUrl,
    scope,
    display: "standalone",
    orientation: "portrait",
    background_color: backgroundColor,
    theme_color: brand?.primary_color || "#000000",
    icons: buildIcons(brand?.logo_url ?? null),
    screenshots,
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
    },
  });
}

/** Superficie CLARA base del diseño (`--surface-app` claro). Splash sin marca ⇒ este near-white. */
const EVA_LIGHT_SURFACE = '#FBFCFD'
const HEX6_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Background del splash del manifest (coach/org): la SUPERFICIE CLARA del tema derivada del
 * color de marca vía el MISMO motor OKLCH que el layout del alumno (`resolveBrandTheme`), en
 * lugar del negro genérico fijo. Un color inválido / sin marca cae a la superficie clara EVA.
 * NOTA: el manifest sólo admite UN background_color (sin variante dark) → se ancla al claro.
 */
function deriveSplashBackground(primaryColor: string | null | undefined): string {
  if (!primaryColor || !HEX6_RE.test(primaryColor)) return EVA_LIGHT_SURFACE
  return resolveBrandTheme({ brandColor: primaryColor }).light.bg
}

/**
 * Íconos del manifest. Fallback EVA → archivos reales 512×512 (cuadrado `any` + maskable con
 * safe-zone 80%, no se recorta en Android), declarados SOLO a 512 para no mentir el size. Marca
 * propia (coach/team) → su logo en 192+512 (tamaño real desconocido; el OS reescala).
 */
function buildIcons(logoUrl: string | null) {
  if (!logoUrl) {
    return [
      { src: BRAND_APP_ICON_512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: BRAND_APP_ICON_MASKABLE, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]
  }
  const type = logoUrl.endsWith('.svg') ? "image/svg+xml" : "image/png"
  return [
    { src: logoUrl, sizes: "192x192", type, purpose: "any" },
    { src: logoUrl, sizes: "512x512", type, purpose: "any" },
    { src: logoUrl, sizes: "192x192", type, purpose: "maskable" },
    { src: logoUrl, sizes: "512x512", type, purpose: "maskable" },
  ]
}

async function resolveManifestBrand(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coach: ManifestBrand & { id: string }
): Promise<ManifestBrand> {
  // getClaims(): verificación local del JWT (ES256), sin /user. Best-effort identity-only (.eq('id', user.id)); manifest público y cacheado (s-maxage 86400) → no requiere revocación fresca.
  const { data: __cl } = await supabase.auth.getClaims()
  const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
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
