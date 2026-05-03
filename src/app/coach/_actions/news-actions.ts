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

  // Obtener IDs de novedades publicadas no leídas
  const { data: unreadItems, error: fetchError } = await supabase
    .from('news_items')
    .select('id')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('id', 'in', (
      supabase.from('news_reads').select('news_item_id').eq('coach_id', coachId)
    ))

  if (fetchError) {
    console.error('[news] fetch unread error:', fetchError)
    return { success: false, error: 'Error al obtener novedades' }
  }

  if (!unreadItems || unreadItems.length === 0) {
    return { success: true }
  }

  const rows = unreadItems.map((item) => ({
    coach_id: coachId,
    news_item_id: item.id,
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

  const { count, error } = await supabase
    .from('news_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('id', 'in', (
      supabase.from('news_reads').select('news_item_id').eq('coach_id', coachId)
    ))

  if (error) {
    console.error('[news] refresh count error:', error)
    return { count: 0, error: 'Error al obtener novedades' }
  }

  return { count: count ?? 0 }
}
