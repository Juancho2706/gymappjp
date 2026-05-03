import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export async function getAllNewsItems() {
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from('news_items')
    .select('id, title, type, content, image_url, cta_url, cta_label, is_pinned, status, published_at, created_at')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[admin-news] fetch error:', error)
    return []
  }

  return data ?? []
}
