import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { z } from 'zod'
import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'

// slug + invite_code son INMUTABLES (set-once en el registro). No hay edición desde mobile.
// El slug legacy se sigue leyendo (getCoachBrandSettings) y mostrando como alias read-only.

// M-F11/TX-6: schema local (mismos límites que la web) hasta poder compartir @eva/schemas.
const brandEditableSchema = z
  .object({
    brandName: z.string().trim().min(2, 'El nombre de marca debe tener al menos 2 caracteres.').max(60, 'El nombre de marca es muy largo (máx 60).'),
    welcomeMessage: z.string().max(240, 'El mensaje de bienvenida supera 240 caracteres.').nullable().optional(),
    loaderText: z.string().max(10, 'El texto del loader supera 10 caracteres.').nullable().optional(),
    welcomeModalContent: z.string().max(1000, 'El contenido del modal supera 1000 caracteres.').nullable().optional(),
    welcomeModalType: z.enum(['text', 'video']),
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
  /** E7-10: logo alternativo para modo oscuro (`logo_url_dark`). */
  logoUrlDark: string | null
  loaderText: string | null
  loaderTextColor: string | null
  loaderIconMode: string
  useCustomLoader: boolean
  welcomeMessage: string | null
  welcomeModalEnabled: boolean
  welcomeModalContent: string | null
  welcomeModalType: 'text' | 'video'
  // E7-10 — white-label v2 avanzado (mismas columnas que el login del alumno respeta, lib/branding.ts).
  /** Tema preset curado (`theme_preset_key`). NULL = color libre legacy (grandfather). */
  themePresetKey: string | null
  /** Variante de layout del login del alumno: clasico|hero|energia|minimal (`login_layout_key`). */
  loginLayoutKey: string | null
  /** Color secundario (color2) para badges/2ª serie (`brand_secondary_color`). */
  brandSecondaryColor: string | null
  /** Override de acento en modo claro (`accent_light`). */
  accentLight: string | null
  /** Override de acento en modo oscuro (`accent_dark`). */
  accentDark: string | null
  /** Tiñe neutrales con el hue de marca (`neutral_tint`). */
  neutralTint: boolean
  /** Fuente de display curada (`brand_font_key`). */
  brandFontKey: string | null
  /** Variante de loader (`loader_variant`). NULL/'eva' = default EVA. */
  loaderVariant: string | null
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
  // E7-10 — avanzado (opcionales; brand.tsx los envía siempre desde el baseline cargado).
  themePresetKey?: string | null
  loginLayoutKey?: string | null
  brandSecondaryColor?: string | null
  accentLight?: string | null
  accentDark?: string | null
  neutralTint?: boolean
  brandFontKey?: string | null
  loaderVariant?: string | null
}

export async function getCoachBrandSettings(): Promise<CoachBrandSettings | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const baseCols = 'id, full_name, brand_name, slug, invite_code, primary_color, use_brand_colors_coach, logo_url, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type'
  // E7-10: columnas white-label v2 (avanzado). Van en la query RICH; si una prod vieja no las
  // tiene, selectWithFallback cae a baseCols y quedan en null/defaults (degradación limpia).
  const v2Cols = 'logo_url_dark, theme_preset_key, login_layout_key, brand_secondary_color, accent_light, accent_dark, neutral_tint, brand_font_key, loader_variant'
  // P4: traer slug_changed_at/previous_slugs para saber si el slug es legacy personalizado.
  // selectWithFallback: si esas columnas no existen en una prod vieja, cae a la query base.
  const { data } = await selectWithFallback<any>(
    () => supabase.from('coaches').select(`${baseCols}, ${v2Cols}, slug_changed_at, previous_slugs`).eq('id', user.id).maybeSingle(),
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
    logoUrlDark: data.logo_url_dark ?? null,
    loaderText: data.loader_text ?? null,
    loaderTextColor: data.loader_text_color ?? null,
    loaderIconMode: (data.loader_icon_mode as string) ?? 'eva',
    useCustomLoader: Boolean(data.use_custom_loader),
    welcomeMessage: data.welcome_message ?? null,
    welcomeModalEnabled: Boolean(data.welcome_modal_enabled),
    welcomeModalContent: data.welcome_modal_content ?? null,
    welcomeModalType: (data.welcome_modal_type as 'text' | 'video') ?? 'text',
    themePresetKey: data.theme_preset_key ?? null,
    loginLayoutKey: data.login_layout_key ?? null,
    brandSecondaryColor: data.brand_secondary_color ?? null,
    accentLight: data.accent_light ?? null,
    accentDark: data.accent_dark ?? null,
    neutralTint: Boolean(data.neutral_tint),
    brandFontKey: data.brand_font_key ?? null,
    loaderVariant: data.loader_variant ?? null,
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
  // E7-10: colores avanzados son OPCIONALES; vacío ⇒ null (el motor deriva desde el principal).
  // Si vienen con valor, deben ser #RRGGBB (mismo guard que la web).
  const optHex = (v: string | null | undefined): { ok: true; value: string | null } | { ok: false } => {
    const t = (v ?? '').trim()
    if (!t) return { ok: true, value: null }
    return /^#[0-9a-fA-F]{6}$/.test(t) ? { ok: true, value: t } : { ok: false }
  }
  const sec = optHex(input.brandSecondaryColor)
  if (!sec.ok) return { ok: false, error: 'Color secundario inválido (usá formato #RRGGBB).' }
  const al = optHex(input.accentLight)
  if (!al.ok) return { ok: false, error: 'Acento claro inválido (usá formato #RRGGBB).' }
  const ad = optHex(input.accentDark)
  if (!ad.ok) return { ok: false, error: 'Acento oscuro inválido (usá formato #RRGGBB).' }

  // Bump welcome_modal_version when the modal changes so students re-see it (web parity).
  const { data: current } = await supabase
    .from('coaches')
    .select('welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version')
    .eq('id', user.id)
    .maybeSingle()

  const modalContent = input.welcomeModalContent?.trim() || null
  const modalChanged =
    Boolean(current?.welcome_modal_enabled) !== input.welcomeModalEnabled ||
    (current?.welcome_modal_content ?? null) !== modalContent ||
    ((current?.welcome_modal_type as string) ?? 'text') !== input.welcomeModalType
  const modalVersion = (current?.welcome_modal_version ?? 0) + (modalChanged ? 1 : 0)

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
      // E7-10 — white-label v2 avanzado (GRANT UPDATE verificado: migraciones 20260621220000 +
      // 20260702210000). Escritas directo bajo RLS coaches_update_own (id = auth.uid()). undefined
      // ⇒ JSON.stringify lo omite ⇒ columna intacta; null ⇒ se limpia explícitamente.
      theme_preset_key: input.themePresetKey ?? null,
      login_layout_key: input.loginLayoutKey || 'clasico',
      brand_secondary_color: sec.value,
      accent_light: al.value,
      accent_dark: ad.value,
      neutral_tint: !!input.neutralTint,
      brand_font_key: input.brandFontKey || null,
      loader_variant: input.loaderVariant || 'eva',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Resize/compress a picked image and upload it as the coach logo. Returns the
 * public URL (cache-busted) persisted to `coaches.logo_url` (light) or
 * `coaches.logo_url_dark` (dark variant, E7-10). Both go direct-to-Storage
 * (bucket `logos`) bajo el path del coach — mismo patrón que esquiva el WAF.
 */
export async function uploadCoachLogo(
  uri: string,
  variant: 'light' | 'dark' = 'light',
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.PNG, base64: true }
    )
    if (!manipulated.base64) return { ok: false, error: 'No se pudo procesar la imagen.' }

    const path = variant === 'dark' ? `${user.id}/logo.dark.png` : `${user.id}/logo.png`
    const { error: upErr } = await supabase.storage
      .from('logos')
      .upload(path, decode(manipulated.base64), { contentType: 'image/png', upsert: true })
    if (upErr) return { ok: false, error: upErr.message }

    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
    const url = `${publicUrl}?t=${Date.now()}`

    const column = variant === 'dark' ? 'logo_url_dark' : 'logo_url'
    const { error: dbErr } = await supabase.from('coaches').update({ [column]: url }).eq('id', user.id)
    if (dbErr) return { ok: false, error: dbErr.message }

    return { ok: true, url }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Error al subir el logo.' }
  }
}
