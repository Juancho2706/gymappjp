'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

const newsSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum(['feature', 'improvement', 'fix', 'announcement']),
  content: z.string().min(10).max(10000),
  image_url: z.string().url().optional().or(z.literal('')),
  cta_url: z.string().max(500).optional().or(z.literal('')),
  cta_label: z.string().max(100).optional().or(z.literal('')),
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
    image_url: (formData.get('image_url') as string) || null,
    cta_url: (formData.get('cta_url') as string) || null,
    cta_label: (formData.get('cta_label') as string) || null,
    is_pinned: formData.get('is_pinned') === 'on',
  }

  const parsed = newsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const { data, error } = await adminClient
    .from('news_items')
    .insert({
      ...parsed.data,
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
    image_url: (formData.get('image_url') as string) || null,
    cta_url: (formData.get('cta_url') as string) || null,
    cta_label: (formData.get('cta_label') as string) || null,
    is_pinned: formData.get('is_pinned') === 'on',
  }

  const parsed = newsSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const { error } = await adminClient
    .from('news_items')
    .update(parsed.data)
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

  const { error } = await adminClient
    .from('news_items')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  await logAdminAction(adminClient, 'publish_news_item', 'news_items', id, { status: 'published' })
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
