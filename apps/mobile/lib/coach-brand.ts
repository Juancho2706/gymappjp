import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { z } from 'zod'
import { supabase } from './supabase'
import { selectWithFallback } from './db-compat'
import { parseLoaderConfig } from './brand-loaders'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'

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
  // W-brand B4: `loader_text_color` salió del contrato — el color lo decide el motor de contraste.
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
  // W-brand B1/B2 (dueño 2026-08-17): `brand_secondary_color`/`accent_light`/`accent_dark`
  // SALIERON del contrato del editor — el par se deriva del primario vía `sealPair` (o viene
  // curado del preset) y los valores almacenados quedan en DB inertes (grandfather pasivo).
  /** Tiñe neutrales con el hue de marca (`neutral_tint`). */
  neutralTint: boolean
  /** Fuente de display curada (`brand_font_key`). */
  brandFontKey: string | null
  /** Variante de loader (`loader_variant`). NULL/'eva' = default EVA. */
  loaderVariant: string | null
  /**
   * QA4 — config del compositor "Crear el mio" (`loader_config`, jsonb). Se expone SERIALIZADA
   * (string JSON o null) para que el editor la trate como valor plano; parsear con
   * `parseLoaderConfig` de lib/brand-loaders. PRECEDE a `loaderVariant` en el render.
   */
  loaderConfig: string | null
  /** QA4 — tema del ejecutor del alumno (`executor_theme`): 'coach' | 'eva'. */
  executorTheme: string | null
}

export interface CoachBrandEditable {
  fullName?: string
  brandName: string
  primaryColor: string
  useBrandColors: boolean
  loaderText: string | null
  loaderIconMode: string
  useCustomLoader: boolean
  welcomeMessage: string | null
  welcomeModalEnabled: boolean
  welcomeModalContent: string | null
  welcomeModalType: 'text' | 'video'
  // E7-10 — avanzado (opcionales; brand.tsx los envía siempre desde el baseline cargado).
  // W-brand B1/B2/B4: secundario, acentos y color de texto del loader YA NO son editables —
  // el editor no los manda y el update no los escribe (whitelist explícita, espejo de la
  // server action web). Los valores almacenados en DB quedan intactos.
  themePresetKey?: string | null
  loginLayoutKey?: string | null
  neutralTint?: boolean
  brandFontKey?: string | null
  loaderVariant?: string | null
  /**
   * QA4 — OPCIONALES de verdad: si el caller no los manda (`undefined`) la columna NO entra al
   * update y queda intacta. Asi el editor viejo sigue guardando byte-identico y solo la UI nueva
   * (compositor / selector de ejecutor) los escribe. `null` limpia explicitamente.
   */
  loaderConfig?: string | null
  executorTheme?: 'coach' | 'eva' | null
}

export async function getCoachBrandSettings(): Promise<CoachBrandSettings | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // W-brand B1/B2/B4: brand_secondary_color, accent_light, accent_dark y loader_text_color
  // salieron de ambos selects — el editor ya no los muestra ni los escribe (las columnas quedan).
  const baseCols = 'id, full_name, brand_name, slug, invite_code, primary_color, use_brand_colors_coach, logo_url, loader_text, loader_icon_mode, use_custom_loader, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type'
  // E7-10: columnas white-label v2 (avanzado). Van en la query RICH; si una prod vieja no las
  // tiene, selectWithFallback cae a baseCols y quedan en null/defaults (degradación limpia).
  // QA4: loader_config + executor_theme entran SOLO por este camino AUTENTICADO (el coach lee su
  // propia fila bajo RLS). El select anonimo del login del alumno (lib/branding.ts) NO se toca.
  const v2Cols = 'logo_url_dark, theme_preset_key, login_layout_key, neutral_tint, brand_font_key, loader_variant, loader_config, executor_theme'
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
    loaderIconMode: (data.loader_icon_mode as string) ?? 'eva',
    useCustomLoader: Boolean(data.use_custom_loader),
    welcomeMessage: data.welcome_message ?? null,
    welcomeModalEnabled: Boolean(data.welcome_modal_enabled),
    welcomeModalContent: data.welcome_modal_content ?? null,
    welcomeModalType: (data.welcome_modal_type as 'text' | 'video') ?? 'text',
    themePresetKey: data.theme_preset_key ?? null,
    loginLayoutKey: data.login_layout_key ?? null,
    neutralTint: Boolean(data.neutral_tint),
    brandFontKey: data.brand_font_key ?? null,
    loaderVariant: data.loader_variant ?? null,
    // jsonb llega como objeto; se normaliza a string JSON estable (o null si el shape no valida).
    loaderConfig: serializeStoredLoaderConfig(data.loader_config),
    executorTheme: (data.executor_theme as string) ?? 'coach',
  }
}

/** jsonb crudo → string JSON estable, o null si no es un compositor valido (fail-closed). */
function serializeStoredLoaderConfig(raw: unknown): string | null {
  const parsed = parseLoaderConfig(raw)
  return parsed ? JSON.stringify(parsed) : null
}

export async function updateCoachBrandSettings(input: CoachBrandEditable): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  const name = input.brandName.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre de marca debe tener al menos 2 caracteres.' }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.primaryColor)) return { ok: false, error: 'Color de marca inválido (usa formato #RRGGBB).' }
  // M-F11/TX-6: validación con zod local (límites + refine de video) — mismos límites que la web.
  const brandValidation = brandEditableSchema.safeParse(input)
  if (!brandValidation.success) {
    return { ok: false, error: brandValidation.error.issues[0]?.message ?? 'Datos de marca inválidos.' }
  }
  // W-brand B1/B2/B4: murieron los inputs hex de secundario/acentos/color de texto del loader —
  // no hay nada que validar acá; esos campos ya no entran al payload (whitelist explícita abajo).

  // Bump welcome_modal_version when the modal changes so students re-see it (web parity).
  const { data: current } = await supabase
    .from('coaches')
    .select('welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version, subscription_tier')
    .eq('id', user.id)
    .maybeSingle()

  // La fila conserva el branding personalizado durante Free, pero este camino de escritura
  // también debe ser fail-closed: una llamada directa no puede modificar el visual bloqueado.
  const brandingAllowed = isBrandingAllowed(
    (current?.subscription_tier ?? 'free') as SubscriptionTier,
  )

  const modalContent = input.welcomeModalContent?.trim() || null
  const modalChanged =
    Boolean(current?.welcome_modal_enabled) !== input.welcomeModalEnabled ||
    (current?.welcome_modal_content ?? null) !== modalContent ||
    ((current?.welcome_modal_type as string) ?? 'text') !== input.welcomeModalType
  const modalVersion = (current?.welcome_modal_version ?? 0) + (modalChanged ? 1 : 0)

  const updatePayload: Record<string, unknown> = {
      // M-F2: full_name editable desde Mi Marca (antes no se escribía).
      ...(input.fullName != null && input.fullName.trim() ? { full_name: input.fullName.trim() } : {}),
      brand_name: name,
      welcome_message: input.welcomeMessage?.trim() || null,
      welcome_modal_enabled: input.welcomeModalEnabled,
      welcome_modal_content: modalContent,
      welcome_modal_type: input.welcomeModalType,
      welcome_modal_version: modalVersion,
      ...(modalChanged ? { welcome_modal_updated_at: new Date().toISOString() } : {}),
      // E7-10 — white-label v2 avanzado (GRANT UPDATE verificado: migraciones 20260621220000 +
      // 20260702210000). Escritas directo bajo RLS coaches_update_own (id = auth.uid()). undefined
      // ⇒ JSON.stringify lo omite ⇒ columna intacta; null ⇒ se limpia explícitamente.
      // QA4 — aditivos y OPT-IN: solo viajan si el caller los mandó. Un editor que no los conoce
      // (`undefined`) deja las columnas intactas y el update sale igual que antes.
      ...(input.executorTheme !== undefined ? { executor_theme: input.executorTheme === 'eva' ? 'eva' : 'coach' } : {}),
      updated_at: new Date().toISOString(),
  }

  if (brandingAllowed) {
    // W-brand B1/B2/B4 — whitelist explícita: brand_secondary_color, accent_light, accent_dark y
    // loader_text_color NO se escriben más desde standalone (ni con null: los valores almacenados
    // quedan intactos en DB — grandfather pasivo, inertes porque la lectura también murió).
    Object.assign(updatePayload, {
      primary_color: input.primaryColor,
      use_brand_colors_coach: input.useBrandColors,
      loader_text: input.loaderText?.trim() || null,
      loader_icon_mode: input.loaderIconMode || 'eva',
      use_custom_loader: input.useCustomLoader,
      theme_preset_key: input.themePresetKey ?? null,
      login_layout_key: input.loginLayoutKey || 'clasico',
      neutral_tint: !!input.neutralTint,
      brand_font_key: input.brandFontKey || null,
      loader_variant: input.loaderVariant || 'eva',
      ...(input.loaderConfig !== undefined ? { loader_config: parseLoaderConfig(input.loaderConfig) } : {}),
    })
  }

  const { error } = await supabase
    .from('coaches')
    .update(updatePayload)
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

  const { data: coach, error: coachError } = await supabase
    .from('coaches')
    .select('subscription_tier')
    .eq('id', user.id)
    .maybeSingle()
  if (coachError || !coach) return { ok: false, error: 'No se pudo verificar tu plan.' }
  if (!isBrandingAllowed((coach.subscription_tier ?? 'free') as SubscriptionTier)) {
    return { ok: false, error: 'El logo personalizado requiere un plan que incluya branding.' }
  }

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
