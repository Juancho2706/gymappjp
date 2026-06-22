import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { z } from 'zod'
import { FONT_KEY_TUPLE, LOADER_VARIANT_TUPLE, type FontKey, type LoaderVariant } from '@eva/schemas'
import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'
import { canUseBranding } from './coach-tiers'
import type { SubscriptionTier } from './coach-tiers'

// slug + invite_code son INMUTABLES (set-once en el registro). No hay edición desde mobile.
// El slug legacy se sigue leyendo (getCoachBrandSettings) y mostrando como alias read-only.

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// M-F11/TX-6: schema local (mismos límites que la web) hasta poder compartir @eva/schemas.
const brandEditableSchema = z
  .object({
    brandName: z.string().trim().min(2, 'El nombre de marca debe tener al menos 2 caracteres.').max(60, 'El nombre de marca es muy largo (máx 60).'),
    welcomeMessage: z.string().max(240, 'El mensaje de bienvenida supera 240 caracteres.').nullable().optional(),
    loaderText: z.string().max(10, 'El texto del loader supera 10 caracteres.').nullable().optional(),
    welcomeModalContent: z.string().max(1000, 'El contenido del modal supera 1000 caracteres.').nullable().optional(),
    welcomeModalType: z.enum(['text', 'video']),
    // ── white-label v2 (espejo de BrandSettingsSchema, gateados a Pro+ en el server / acá en save) ──
    // color2 INDEPENDIENTE (badges/tags/macros/charts); accent por-modo; fuente curada; loader.
    brandSecondaryColor: z.string().regex(HEX_RE, 'Color hexadecimal inválido.').nullable().optional().or(z.literal('')),
    accentLight: z.string().regex(HEX_RE, 'Color hexadecimal inválido.').nullable().optional().or(z.literal('')),
    accentDark: z.string().regex(HEX_RE, 'Color hexadecimal inválido.').nullable().optional().or(z.literal('')),
    // brand_font_key: enum cerrado (NUNCA string libre — única defensa anti CSS-injection en fuente).
    brandFontKey: z.enum(FONT_KEY_TUPLE).nullable().optional().or(z.literal('')),
    loaderVariant: z.enum(LOADER_VARIANT_TUPLE).optional(),
  })
  .passthrough()
  .superRefine((v: any, ctx) => {
    if (v.welcomeModalType === 'video' && typeof v.welcomeModalContent === 'string' && v.welcomeModalContent.trim()) {
      if (!/(youtube\.com|youtu\.be|vimeo\.com)/i.test(v.welcomeModalContent)) {
        ctx.addIssue({ code: 'custom', message: 'El video debe ser un enlace de YouTube o Vimeo.', path: ['welcomeModalContent'] })
      }
    }
  })

// Coach white-label branding. Reads + writes the coach's own `coaches` row
// directly under the session (RLS `coaches_update_own` allows id = auth.uid()).
// Logo uploads go to the `logos` storage bucket at `${uid}/logo.png`.

export interface CoachBrandSettings {
  id: string
  fullName: string
  brandName: string
  slug: string
  inviteCode: string | null
  /** P4: el coach personalizó su slug (cambió la URL alguna vez) → mantener editor de slug legacy. */
  hasLegacySlug: boolean
  primaryColor: string
  useBrandColors: boolean
  logoUrl: string | null
  loaderText: string | null
  loaderTextColor: string | null
  loaderIconMode: string
  useCustomLoader: boolean
  welcomeMessage: string | null
  welcomeModalEnabled: boolean
  welcomeModalContent: string | null
  welcomeModalType: 'text' | 'video'
  // white-label v2 (Pro+) — branding avanzado
  brandSecondaryColor: string | null
  accentLight: string | null
  accentDark: string | null
  neutralTint: boolean
  brandFontKey: FontKey | null
  loaderVariant: LoaderVariant
}

export interface CoachBrandEditable {
  fullName?: string
  brandName: string
  primaryColor: string
  useBrandColors: boolean
  loaderText: string | null
  loaderTextColor: string | null
  loaderIconMode: string
  useCustomLoader: boolean
  welcomeMessage: string | null
  welcomeModalEnabled: boolean
  welcomeModalContent: string | null
  welcomeModalType: 'text' | 'video'
  // white-label v2 (Pro+). Opcionales: si la pantalla no los manda, no se tocan.
  brandSecondaryColor?: string | null
  accentLight?: string | null
  accentDark?: string | null
  neutralTint?: boolean
  brandFontKey?: FontKey | '' | null
  loaderVariant?: LoaderVariant
}

export async function getCoachBrandSettings(): Promise<CoachBrandSettings | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // white-label v2: 7 cols nuevas (LIVE en prod desde 2026-06-21). Van en la query "rica";
  // selectWithFallback cae a baseCols si una prod vieja no las tiene (db-compat, sin romper el read).
  const baseCols = 'id, full_name, brand_name, slug, invite_code, primary_color, use_brand_colors_coach, logo_url, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type'
  const v2Cols = 'brand_secondary_color, accent_light, accent_dark, neutral_tint, brand_font_key, loader_variant'
  // P4: traer slug_changed_at/previous_slugs para saber si el slug es legacy personalizado.
  // selectWithFallback: si esas columnas no existen en una prod vieja, cae a la query base.
  const { data } = await selectWithFallback<any>(
    () => supabase.from('coaches').select(`${baseCols}, slug_changed_at, previous_slugs, ${v2Cols}`).eq('id', user.id).maybeSingle(),
    () => supabase.from('coaches').select(baseCols).eq('id', user.id).maybeSingle(),
  )

  if (!data) return null
  const prevSlugs = (data as { previous_slugs?: string[] | null }).previous_slugs
  const hasLegacySlug = Boolean((data as { slug_changed_at?: string | null }).slug_changed_at) || (Array.isArray(prevSlugs) && prevSlugs.length > 0)
  return {
    id: data.id,
    fullName: data.full_name ?? '',
    brandName: data.brand_name ?? '',
    slug: data.slug ?? '',
    inviteCode: data.invite_code ?? null,
    hasLegacySlug,
    primaryColor: data.primary_color ?? '#007AFF',
    useBrandColors: Boolean(data.use_brand_colors_coach),
    logoUrl: data.logo_url ?? null,
    loaderText: data.loader_text ?? null,
    loaderTextColor: data.loader_text_color ?? null,
    loaderIconMode: (data.loader_icon_mode as string) ?? 'eva',
    useCustomLoader: Boolean(data.use_custom_loader),
    welcomeMessage: data.welcome_message ?? null,
    welcomeModalEnabled: Boolean(data.welcome_modal_enabled),
    welcomeModalContent: data.welcome_modal_content ?? null,
    welcomeModalType: (data.welcome_modal_type as 'text' | 'video') ?? 'text',
    // white-label v2 — fail-closed: key/variant inválida (o col ausente en prod vieja) cae a null/'eva'.
    brandSecondaryColor: data.brand_secondary_color ?? null,
    accentLight: data.accent_light ?? null,
    accentDark: data.accent_dark ?? null,
    neutralTint: Boolean(data.neutral_tint),
    brandFontKey: (FONT_KEY_TUPLE as readonly string[]).includes(data.brand_font_key) ? (data.brand_font_key as FontKey) : null,
    loaderVariant: (LOADER_VARIANT_TUPLE as readonly string[]).includes(data.loader_variant) ? (data.loader_variant as LoaderVariant) : 'eva',
  }
}

export async function updateCoachBrandSettings(input: CoachBrandEditable): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  const name = input.brandName.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre de marca debe tener al menos 2 caracteres.' }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.primaryColor)) return { ok: false, error: 'Color de marca inválido (usá formato #RRGGBB).' }
  // M-F11/TX-6: validación con zod local (límites + refine de video) — mismos límites que la web.
  const brandValidation = brandEditableSchema.safeParse(input)
  if (!brandValidation.success) {
    return { ok: false, error: brandValidation.error.issues[0]?.message ?? 'Datos de marca inválidos.' }
  }

  // Bump welcome_modal_version when the modal changes so students re-see it (web parity).
  // subscription_tier: gate del branding avanzado (white-label v2, mismo gate Pro+ que la web).
  const { data: current } = await supabase
    .from('coaches')
    .select('welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version, subscription_tier')
    .eq('id', user.id)
    .maybeSingle()

  const modalContent = input.welcomeModalContent?.trim() || null
  const modalChanged =
    Boolean(current?.welcome_modal_enabled) !== input.welcomeModalEnabled ||
    (current?.welcome_modal_content ?? null) !== modalContent ||
    ((current?.welcome_modal_type as string) ?? 'text') !== input.welcomeModalType
  const modalVersion = (current?.welcome_modal_version ?? 0) + (modalChanged ? 1 : 0)

  // ── Gate de branding avanzado (Pro+) ──────────────────────────────────────────
  // Espejo del server action web: las 6 cols v2 solo se escriben si el coach es Pro+.
  // La pantalla ya gatea la UI, pero esto es el enforcement real (el PATCH es invocable directo).
  // Solo se incluyen las cols v2 que la pantalla EFECTIVAMENTE manda (campo presente en input).
  const tier = (current?.subscription_tier ?? 'free') as SubscriptionTier
  const brandingAllowed = canUseBranding(tier)
  const v2Payload: Record<string, unknown> = {}
  if (brandingAllowed) {
    if (input.brandSecondaryColor !== undefined) v2Payload.brand_secondary_color = input.brandSecondaryColor?.trim() || null
    if (input.accentLight !== undefined) v2Payload.accent_light = input.accentLight?.trim() || null
    if (input.accentDark !== undefined) v2Payload.accent_dark = input.accentDark?.trim() || null
    if (input.neutralTint !== undefined) v2Payload.neutral_tint = input.neutralTint
    if (input.brandFontKey !== undefined) v2Payload.brand_font_key = input.brandFontKey || null
    if (input.loaderVariant !== undefined) v2Payload.loader_variant = input.loaderVariant || 'eva'
  }

  const { error } = await supabase
    .from('coaches')
    .update({
      // M-F2: full_name editable desde Mi Marca (antes no se escribía).
      ...(input.fullName != null && input.fullName.trim() ? { full_name: input.fullName.trim() } : {}),
      brand_name: name,
      primary_color: input.primaryColor,
      use_brand_colors_coach: input.useBrandColors,
      loader_text: input.loaderText?.trim() || null,
      loader_text_color: input.loaderTextColor?.trim() || null,
      loader_icon_mode: input.loaderIconMode || 'eva',
      use_custom_loader: input.useCustomLoader,
      welcome_message: input.welcomeMessage?.trim() || null,
      welcome_modal_enabled: input.welcomeModalEnabled,
      welcome_modal_content: modalContent,
      welcome_modal_type: input.welcomeModalType,
      welcome_modal_version: modalVersion,
      ...(modalChanged ? { welcome_modal_updated_at: new Date().toISOString() } : {}),
      ...v2Payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Resize/compress a picked image and upload it as the coach logo. Returns the
 * public URL (cache-busted) persisted to `coaches.logo_url`.
 */
export async function uploadCoachLogo(uri: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.PNG, base64: true }
    )
    if (!manipulated.base64) return { ok: false, error: 'No se pudo procesar la imagen.' }

    const path = `${user.id}/logo.png`
    const { error: upErr } = await supabase.storage
      .from('logos')
      .upload(path, decode(manipulated.base64), { contentType: 'image/png', upsert: true })
    if (upErr) return { ok: false, error: upErr.message }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`

    const { error: dbErr } = await supabase.from('coaches').update({ logo_url: url }).eq('id', user.id)
    if (dbErr) return { ok: false, error: dbErr.message }

    return { ok: true, url }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al subir el logo.' }
  }
}
