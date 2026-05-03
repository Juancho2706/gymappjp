'use client'

import { createContext, useContext, useState, useCallback, useEffect, useOptimistic } from 'react'
import { markAllNewsAsRead, refreshNewsCount } from '@/app/coach/_actions/news-actions'

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

interface NewsFeedContextValue {
  items: NewsItem[]
  unreadCount: number
  markAllAsRead: () => Promise<void>
}

const NewsFeedContext = createContext<NewsFeedContextValue | null>(null)

export function useNewsFeed() {
  const ctx = useContext(NewsFeedContext)
  if (!ctx) throw new Error('useNewsFeed must be used within NewsFeedProvider')
  return ctx
}

export function NewsFeedProvider({
  children,
  initialUnreadCount,
  initialItems,
}: {
  children: React.ReactNode
  initialUnreadCount: number
  initialItems: NewsItem[]
}) {
  const [items] = useState(initialItems)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount)
  const [optimisticCount, setOptimisticCount] = useOptimistic(unreadCount)
  const handleMarkAllAsRead = useCallback(async () => {
    if (optimisticCount === 0) return
    const currentCount = unreadCount
    setOptimisticCount(0)
    try {
      const result = await markAllNewsAsRead()
      if (result.success) {
        setUnreadCount(0)
      } else {
        setOptimisticCount(currentCount)
      }
    } catch (err) {
      setOptimisticCount(currentCount)
      console.error('[news] mark read exception:', err)
    }
  }, [optimisticCount, unreadCount, setOptimisticCount])

  // Refresh count when user returns to the tab to catch newly published items
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshNewsCount()
          .then(({ count }) => {
            setUnreadCount(count)
          })
          .catch(() => {
            // Silently ignore refresh errors
          })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  return (
    <NewsFeedContext.Provider
      value={{
        items,
        unreadCount: optimisticCount,
        markAllAsRead: handleMarkAllAsRead,
      }}
    >
      {children}
    </NewsFeedContext.Provider>
  )
}
