import { createClient } from '@/lib/supabase/server'
import { cache } from 'react'
import { findNewsReadsByCoach, findPublishedNewsIds, findPublishedNewsItems } from '@/infrastructure/db'

export const getUnreadNewsCount = cache(async function getUnreadNewsCount(coachId: string): Promise<number> {
  const supabase = await createClient()

  let newsItems: Array<{ id: string }>
  try {
    newsItems = await findPublishedNewsIds(supabase, new Date().toISOString())
  } catch (error) {
    console.error('[news] unread count error (news):', error)
    return 0
  }

  if (!newsItems || newsItems.length === 0) {
    return 0
  }

  // Fetch reads for this coach
  let reads: Array<{ news_item_id: string }>
  try {
    reads = await findNewsReadsByCoach(supabase, coachId)
  } catch (error) {
    console.error('[news] unread count error (reads):', error)
    return 0
  }

  const readIds = new Set(reads.map((r) => r.news_item_id))
  const unreadCount = newsItems.filter((ni) => !readIds.has(ni.id)).length

  return unreadCount
})

export async function getPublishedNewsItems() {
  const supabase = await createClient()

  try {
    return await findPublishedNewsItems(supabase, new Date().toISOString())
  } catch (error) {
    console.error('[news] fetch items error:', error)
    return []
  }
}
