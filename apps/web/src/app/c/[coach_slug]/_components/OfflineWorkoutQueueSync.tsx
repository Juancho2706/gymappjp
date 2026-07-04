'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { logSetAction } from '@/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions'
import {
    flushWorkoutQueue,
    readWorkoutOfflineQueue,
    workoutLogToFormData,
} from '@/lib/workout-offline-queue'

export function OfflineWorkoutQueueSync() {
    const router = useRouter()
    const flushing = useRef(false)

    useEffect(() => {
        async function flushQueue() {
            if (flushing.current) return
            if (readWorkoutOfflineQueue().length === 0) return
            flushing.current = true
            try {
                // Dedupe + reenvío + poda de huérfanos vive en el helper compartido (mismo camino que
                // el gate de "Finalizar" del ejecutor). last-wins/idempotente por (block,set,día).
                const { flushed, discarded } = await flushWorkoutQueue((item) =>
                    logSetAction({}, workoutLogToFormData(item)),
                )
                if (flushed > 0) {
                    toast.success(`${flushed} set${flushed !== 1 ? 's' : ''} sincronizado${flushed !== 1 ? 's' : ''}`)
                    router.refresh()
                } else if (discarded > 0) {
                    // Solo huérfanos descartados: refrescar igual para limpiar cualquier pendiente fantasma.
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
