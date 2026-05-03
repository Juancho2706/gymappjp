import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export const getUnreadNewsCount = cache(async function getUnreadNewsCount(coachId: string): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('news_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .not('id', 'in', (
      supabase.from('news_reads').select('news_item_id').eq('coach_id', coachId)
    ))

  if (error) {
    console.error('[news] unread count error:', error)
    return 0
  }

  return count ?? 0
})

export async function getPublishedNewsItems() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('news_items')
    .select('id, title, type, content, image_url, cta_url, cta_label, is_pinned, published_at')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .order('is_pinned', { ascending: false })
    .order('published_at', { ascending: false })

  if (error) {
    console.error('[news] fetch items error:', error)
    return []
  }

  return data ?? []
}
