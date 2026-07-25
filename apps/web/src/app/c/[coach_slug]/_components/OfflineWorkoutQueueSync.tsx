'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as Sentry from '@sentry/nextjs'
import { logSetAction } from '@/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions'
import {
    flushWorkoutQueue,
    readWorkoutOfflineQueue,
    workoutLogToFormData,
} from '@/lib/workout-offline-queue'
import { waitForCeremonyEnd } from '@/lib/workout/launch-ceremony'

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
                if (discarded > 0) {
                    // Un descarte es una serie que el alumno YA entrenó y que no va a llegar al server
                    // nunca (rechazo permanente o zombi que agotó reintentos). Silenciarlo es pérdida
                    // de datos invisible: se avisa al alumno y se deja rastro en Sentry para triage.
                    Sentry.captureMessage('workout-offline-queue: series descartadas en el flush', {
                        level: 'warning',
                        extra: { discarded, flushed },
                    })
                    toast.error(
                        discarded === 1
                            ? 'No pudimos guardar 1 serie registrada sin conexión. Revisa tu entrenamiento.'
                            : `No pudimos guardar ${discarded} series registradas sin conexión. Revisa tu entrenamiento.`,
                    )
                }
                if (flushed > 0) {
                    toast.success(`${flushed} set${flushed !== 1 ? 's' : ''} sincronizado${flushed !== 1 ? 's' : ''}`)
                    // El flush ya persistió; SÓLO el refresh se difiere hasta que termine la ceremonia del
                    // Despegue. Sin esto, un refresh en red lenta degradaba a navegación dura y remontaba el
                    // provider del overlay → moría sin tap (root cause de la auditoría). Válvula a 15 s.
                    await waitForCeremonyEnd(15000)
                    router.refresh()
                } else if (discarded > 0) {
                    // Solo huérfanos descartados: refrescar igual para limpiar cualquier pendiente fantasma.
                    await waitForCeremonyEnd(15000)
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
