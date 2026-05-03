'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markAllNewsAsRead(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'No autenticado' }
  }

  const coachId = user.id

  // Fetch published news IDs
  const { data: newsItems, error: newsError } = await supabase
    .from('news_items')
    .select('id')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())

  if (newsError) {
    console.error('[news] mark read fetch error:', newsError)
    return { success: false, error: 'Error al obtener novedades' }
  }

  if (!newsItems || newsItems.length === 0) {
    return { success: true }
  }

  // Fetch existing reads for this coach
  const { data: reads, error: readsError } = await supabase
    .from('news_reads')
    .select('news_item_id')
    .eq('coach_id', coachId)

  if (readsError) {
    console.error('[news] mark read reads error:', readsError)
    return { success: false, error: 'Error al verificar lecturas' }
  }

  const readIds = new Set(reads?.map((r) => r.news_item_id) ?? [])
  const unreadIds = newsItems.filter((ni) => !readIds.has(ni.id)).map((ni) => ni.id)

  if (unreadIds.length === 0) {
    return { success: true }
  }

  const rows = unreadIds.map((id) => ({
    coach_id: coachId,
    news_item_id: id,
  }))

  const { error: insertError } = await supabase
    .from('news_reads')
    .insert(rows)

  if (insertError) {
    console.error('[news] insert reads error:', insertError)
    return { success: false, error: 'No se pudo marcar como leído' }
  }

  revalidatePath('/coach/dashboard')
  return { success: true }
}

export async function refreshNewsCount(): Promise<{ count: number; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { count: 0, error: 'No autenticado' }
  }

  const coachId = user.id

  const { data: newsItems, error: newsError } = await supabase
    .from('news_items')
    .select('id')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())

  if (newsError) {
    console.error('[news] refresh count error:', newsError)
    return { count: 0, error: 'Error al obtener novedades' }
  }

  if (!newsItems || newsItems.length === 0) {
    return { count: 0 }
  }

  const { data: reads, error: readsError } = await supabase
    .from('news_reads')
    .select('news_item_id')
    .eq('coach_id', coachId)

  if (readsError) {
    console.error('[news] refresh reads error:', readsError)
    return { count: 0, error: 'Error al verificar lecturas' }
  }

  const readIds = new Set(reads?.map((r) => r.news_item_id) ?? [])
  const unreadCount = newsItems.filter((ni) => !readIds.has(ni.id)).length

  return { count: unreadCount }
}
