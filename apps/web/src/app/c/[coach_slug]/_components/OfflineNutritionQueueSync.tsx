'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { toggleMealCompletion } from '@/app/c/[coach_slug]/nutrition/_actions/nutrition.actions'
import {
  readNutritionOfflineToggleQueue,
  writeNutritionOfflineToggleQueue,
} from '@/lib/nutrition-offline-queue'

/**
 * Drena la cola de toggles nutrición en cualquier ruta /c/[slug] (dashboard + nutrición).
 */
export function OfflineNutritionQueueSync() {
  const router = useRouter()
  const flushing = useRef(false)

  useEffect(() => {
    async function flushQueue() {
      if (flushing.current) return
      const q = readNutritionOfflineToggleQueue()
      if (q.length === 0) return
      flushing.current = true
      const remaining: typeof q = []
      let flushed = 0
      try {
        for (const item of q) {
          try {
            const res = await toggleMealCompletion(
              item.userId,
              item.planId,
              item.mealId,
              item.completed,
              item.logId,
              item.coachSlug,
              item.date
            )
            if (res.success) flushed++
            else remaining.push(item)
          } catch {
            remaining.push(item)
          }
        }
        writeNutritionOfflineToggleQueue(remaining)
        if (flushed > 0) {
          toast.success(`${flushed} acción${flushed !== 1 ? 'es' : ''} sincronizada${flushed !== 1 ? 's' : ''}`)
          router.refresh()
        }
      } finally {
        flushing.current = false
      }
    }

    void flushQueue()
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [router])

  return null
}
