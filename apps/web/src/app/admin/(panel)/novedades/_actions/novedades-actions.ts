'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

const newsSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum(['feature', 'improvement', 'fix', 'announcement']),
  content: z.string().min(10).max(10000),
  image_url: z.string().url().optional().or(z.literal('')).nullable(),
  cta_url: z.string().max(500).optional().or(z.literal('')).nullable(),
  cta_label: z.string().max(100).optional().or(z.literal('')).nullable(),
  is_pinned: z.boolean().default(false),
})

export type NewsActionResult =
  | { success: true; id?: string }
  | { success: false; error: string }

export async function createNewsItemAction(
  _prev: NewsActionResult | null,
  formData: FormData
): Promise<NewsActionResult> {
  const { adminClient, user } = await assertAdmin()

  const raw = {
    title: formData.get('title') as string,
    type: formData.get('type') as string,
    content: formData.get('content') as string,
    image_url: formData.get('image_url') as string | null,
    cta_url: formData.get('cta_url') as string | null,
    cta_label: formData.get('cta_label') as string | null,
    is_pinned: formData.get('is_pinned') === 'on',
  }

  const parsed = newsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  // Convertir strings vacíos a null para la base de datos
  const payload = {
    ...parsed.data,
    image_url: parsed.data.image_url || null,
    cta_url: parsed.data.cta_url || null,
    cta_label: parsed.data.cta_label || null,
  }

  const { data, error } = await adminClient
    .from('news_items')
    .insert({
      ...payload,
      created_by: user.id,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error || !data) {
    return { success: false, error: error?.message || 'Error al crear novedad' }
  }

  await logAdminAction(adminClient, 'create_news_item', 'news_items', data.id, parsed.data)
  revalidatePath('/admin/novedades')
  return { success: true, id: data.id }
}

export async function updateNewsItemAction(
  id: string,
  _prev: NewsActionResult | null,
  formData: FormData
): Promise<NewsActionResult> {
  const { adminClient } = await assertAdmin()

  const raw = {
    title: formData.get('title') as string,
    type: formData.get('type') as string,
    content: formData.get('content') as string,
    image_url: formData.get('image_url') as string | null,
    cta_url: formData.get('cta_url') as string | null,
    cta_label: formData.get('cta_label') as string | null,
    is_pinned: formData.get('is_pinned') === 'on',
  }

  const parsed = newsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  // Convertir strings vacíos a null para la base de datos
  const payload = {
    ...parsed.data,
    image_url: parsed.data.image_url || null,
    cta_url: parsed.data.cta_url || null,
    cta_label: parsed.data.cta_label || null,
  }

  const { error } = await adminClient
    .from('news_items')
    .update(payload)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'update_news_item', 'news_items', id, parsed.data)
  revalidatePath('/admin/novedades')
  return { success: true }
}

export async function publishNewsItemAction(id: string): Promise<NewsActionResult> {
  const { adminClient } = await assertAdmin()

  // published_at se sella UNA sola vez. Esta misma accion sirve para publicar un borrador y
  // para restaurar un archivado: si al restaurar reescribieramos la fecha, una novedad de
  // enero archivada y restaurada en agosto figuraria como publicada en agosto (miente en el
  // feed de los coaches y en el orden del historial). Solo se setea cuando nunca la tuvo.
  const { data: current, error: readError } = await adminClient
    .from('news_items')
    .select('published_at')
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    return { success: false, error: readError.message }
  }
  if (!current) {
    return { success: false, error: 'La novedad ya no existe' }
  }

  const patch: { status: string; published_at?: string } = { status: 'published' }
  if (!current.published_at) {
    patch.published_at = new Date().toISOString()
  }

  const { error } = await adminClient
    .from('news_items')
    .update(patch)
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'publish_news_item', 'news_items', id, {
    status: 'published',
    published_at: current.published_at ?? patch.published_at,
    // true = restauracion que conservo la fecha original (no es una publicacion nueva).
    published_at_preserved: Boolean(current.published_at),
  })
  revalidatePath('/admin/novedades')
  return { success: true }
}

export async function archiveNewsItemAction(id: string): Promise<NewsActionResult> {
  const { adminClient } = await assertAdmin()

  const { error } = await adminClient
    .from('news_items')
    .update({ status: 'archived' })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'archive_news_item', 'news_items', id, { status: 'archived' })
  revalidatePath('/admin/novedades')
  return { success: true }
}

export async function deleteNewsItemAction(id: string): Promise<NewsActionResult> {
  const { adminClient } = await assertAdmin()

  const { error } = await adminClient.from('news_items').delete().eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'delete_news_item', 'news_items', id, null)
  revalidatePath('/admin/novedades')
  return { success: true }
}

export async function togglePinNewsItemAction(id: string, isPinned: boolean): Promise<NewsActionResult> {
  const { adminClient } = await assertAdmin()

  const { error } = await adminClient
    .from('news_items')
    .update({ is_pinned: isPinned })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'toggle_pin_news_item', 'news_items', id, { is_pinned: isPinned })
  revalidatePath('/admin/novedades')
  return { success: true }
}
