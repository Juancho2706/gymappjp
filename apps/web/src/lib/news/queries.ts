import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'

export const getUnreadNewsCount = cache(async function getUnreadNewsCount(coachId: string): Promise<number> {
  const supabase = await createClient()

  // Fetch published news IDs
  const { data: newsItems, error: newsError } = await supabase
    .from('news_items')
    .select('id')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())

  if (newsError) {
    console.error('[news] unread count error (news):', newsError)
    return 0
  }

  if (!newsItems || newsItems.length === 0) {
    return 0
  }

  // Fetch reads for this coach
  const { data: reads, error: readsError } = await supabase
    .from('news_reads')
    .select('news_item_id')
    .eq('coach_id', coachId)

  if (readsError) {
    console.error('[news] unread count error (reads):', readsError)
    return 0
  }

  const readIds = new Set(reads?.map((r) => r.news_item_id) ?? [])
  const unreadCount = newsItems.filter((ni) => !readIds.has(ni.id)).length

  return unreadCount
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
