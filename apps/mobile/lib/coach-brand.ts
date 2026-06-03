import * as ImageManipulator from 'expo-image-manipulator'
import { decode } from 'base64-arraybuffer'
import { supabase } from './supabase'

// Coach white-label branding. Reads + writes the coach's own `coaches` row
// directly under the session (RLS `coaches_update_own` allows id = auth.uid()).
// Logo uploads go to the `logos` storage bucket at `${uid}/logo.png`.

export interface CoachBrandSettings {
  id: string
  fullName: string
  brandName: string
  slug: string
  inviteCode: string | null
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
}

export interface CoachBrandEditable {
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
}

export async function getCoachBrandSettings(): Promise<CoachBrandSettings | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('coaches')
    .select('id, full_name, brand_name, slug, invite_code, primary_color, use_brand_colors_coach, logo_url, loader_text, loader_text_color, loader_icon_mode, use_custom_loader, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    fullName: data.full_name ?? '',
    brandName: data.brand_name ?? '',
    slug: data.slug ?? '',
    inviteCode: data.invite_code ?? null,
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
  }
}

export async function updateCoachBrandSettings(input: CoachBrandEditable): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado.' }

  const name = input.brandName.trim()
  if (name.length < 2) return { ok: false, error: 'El nombre de marca debe tener al menos 2 caracteres.' }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.primaryColor)) return { ok: false, error: 'Color de marca inválido (usá formato #RRGGBB).' }

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
