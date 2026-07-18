import { apiFetch } from './api'

/**
 * Feed de Novedades del coach (espejo de la NewsBell web).
 * Fuente: /api/mobile/coach/news (tablas news_items + news_reads, service role).
 */
export type CoachNewsType = 'feature' | 'improvement' | 'fix' | 'announcement' | string

export interface CoachNewsItem {
  id: string
  title: string
  type: CoachNewsType
  content: string
  image_url: string | null
  cta_url: string | null
  cta_label: string | null
  is_pinned: boolean | null
  published_at: string | null
}

export interface CoachNewsResponse {
  items: CoachNewsItem[]
  unreadCount: number
}

export function getCoachNews() {
  return apiFetch<CoachNewsResponse>('/api/mobile/coach/news', {
    method: 'GET',
    authenticated: true,
  })
}

export function markCoachNewsRead() {
  return apiFetch<{ ok: true; unreadCount: number }>('/api/mobile/coach/news', {
    method: 'POST',
    authenticated: true,
  })
}
