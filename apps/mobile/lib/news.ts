import { supabase } from './supabase'

/**
 * Feed de novedades (mobile) — espejo de la web:
 *  - lectura: apps/web/src/lib/news/queries.ts (getPublishedNewsItems / getUnreadNewsCount)
 *  - marcar leído: apps/web/src/app/coach/_actions/news-actions.ts (markAllNewsAsRead)
 *
 * Tablas: `news_items` (status='published', published_at<=now) + `news_reads` (coach_id, news_item_id).
 * RLS authoritative (coach_id=auth.uid()). NO service-role.
 */

export type NewsItem = {
  id: string
  title: string
  type: string
  content: string
  image_url: string | null
  cta_url: string | null
  cta_label: string | null
  is_pinned: boolean | null
  published_at: string | null
}

/** Novedades publicadas, pinned primero, luego más recientes. [] por defecto / error. */
export async function getPublishedNewsItems(): Promise<NewsItem[]> {
  try {
    const { data, error } = await supabase
      .from('news_items')
      .select('id, title, type, content, image_url, cta_url, cta_label, is_pinned, published_at')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as NewsItem[]
  } catch (e) {
    console.error('[news] fetch items error:', e)
    return []
  }
}

/** Cuenta de novedades no leídas para el coach. 0 por defecto / error. */
export async function getUnreadNewsCount(coachId: string): Promise<number> {
  try {
    const { data: items, error: itemsErr } = await supabase
      .from('news_items')
      .select('id')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
    if (itemsErr) throw itemsErr
    if (!items || items.length === 0) return 0

    const { data: reads, error: readsErr } = await supabase
      .from('news_reads')
      .select('news_item_id')
      .eq('coach_id', coachId)
    if (readsErr) throw readsErr

    const readIds = new Set((reads ?? []).map((r: { news_item_id: string }) => r.news_item_id))
    return (items as Array<{ id: string }>).filter((ni) => !readIds.has(ni.id)).length
  } catch (e) {
    console.error('[news] unread count error:', e)
    return 0
  }
}

export type MarkReadResult = { success: boolean; error?: string }

/** Marca TODAS las novedades publicadas como leídas para el coach actual. Idempotente. */
export async function markAllNewsAsRead(): Promise<MarkReadResult> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const coachId = auth.user?.id
    if (!coachId) return { success: false, error: 'No autenticado' }

    const { data: items, error: itemsErr } = await supabase
      .from('news_items')
      .select('id')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
    if (itemsErr) return { success: false, error: 'Error al obtener novedades' }
    if (!items || items.length === 0) return { success: true }

    const { data: reads, error: readsErr } = await supabase
      .from('news_reads')
      .select('news_item_id')
      .eq('coach_id', coachId)
    if (readsErr) return { success: false, error: 'Error al verificar lecturas' }

    const readIds = new Set((reads ?? []).map((r: { news_item_id: string }) => r.news_item_id))
    const unreadIds = (items as Array<{ id: string }>).filter((ni) => !readIds.has(ni.id)).map((ni) => ni.id)
    if (unreadIds.length === 0) return { success: true }

    const rows = unreadIds.map((id) => ({ coach_id: coachId, news_item_id: id }))
    const { error: insertErr } = await supabase.from('news_reads').insert(rows)
    if (insertErr) return { success: false, error: 'No se pudo marcar como leído' }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'No se pudo marcar como leído' }
  }
}
