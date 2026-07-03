'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { logSetAction } from '@/app/c/[coach_slug]/workout/[planId]/_actions/workout-log.actions'
import {
    dedupeWorkoutQueue,
    readWorkoutOfflineQueue,
    writeWorkoutOfflineQueue,
} from '@/lib/workout-offline-queue'

export function OfflineWorkoutQueueSync() {
    const router = useRouter()
    const flushing = useRef(false)

    useEffect(() => {
        async function flushQueue() {
            if (flushing.current) return
            // Dedupe por (block_id, set_number) ANTES de tocar la red: la última intención gana.
            // Sin esto, re-submits offline de la misma serie se reproducían todos en secuencia y
            // el server escribía last-wins con fantasmas intermedios (forense 2026-07-03).
            const q = dedupeWorkoutQueue(readWorkoutOfflineQueue())
            if (q.length === 0) return
            flushing.current = true
            const remaining: typeof q = []
            let flushed = 0
            let discarded = 0
            try {
                for (const item of q) {
                    try {
                        const fd = new FormData()
                        fd.set('block_id', item.blockId)
                        fd.set('set_number', String(item.setNumber))
                        if (item.weightKg != null) fd.set('weight_kg', String(item.weightKg))
                        if (item.repsDone != null) fd.set('reps_done', String(item.repsDone))
                        if (item.rpe != null) fd.set('rpe', String(item.rpe))
                        if (item.rir != null) fd.set('rir', String(item.rir))
                        if (item.note != null && item.note !== '') fd.set('note', item.note)
                        // Polimórfico (AC4): los items legacy no traen estas keys — no-op.
                        if (item.actualDurationSec != null) fd.set('actual_duration_sec', String(item.actualDurationSec))
                        if (item.actualDistanceM != null) fd.set('actual_distance_m', String(item.actualDistanceM))
                        if (item.actualHoldSec != null) fd.set('actual_hold_sec', String(item.actualHoldSec))
                        if (item.actualAvgHr != null) fd.set('actual_avg_hr', String(item.actualAvgHr))
                        const res = await logSetAction({}, fd)
                        if (res.success) {
                            flushed++
                        } else if (res.code === 'invalid_block') {
                            // Huérfano de reseed: el bloque ya no existe → descartar, jamás reintentar.
                            discarded++
                            console.warn(
                                `[workout-queue] descarto serie huérfana (block_id inexistente): ${item.blockId}:${item.setNumber}`,
                            )
                        } else {
                            remaining.push(item)
                        }
                    } catch {
                        // Excepción (red caída al enviar) → transitorio: se reintenta luego.
                        remaining.push(item)
                    }
                }
                writeWorkoutOfflineQueue(remaining)
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
