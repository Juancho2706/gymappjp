import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { reportWorkoutQueueDiscards } from './report-discards'

vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn() }))

const captureMessage = vi.mocked(Sentry.captureMessage)

describe('reportWorkoutQueueDiscards', () => {
    beforeEach(() => {
        captureMessage.mockClear()
    })

    // Grouping REAL por causa: captureMessage agrupa por texto del mensaje, así que el code viaja EN
    // el mensaje (y en el fingerprint). Un evento por causa ⇒ dos causas, dos issues.
    it('emite un captureMessage POR code, con tags y fingerprint por causa', () => {
        reportWorkoutQueueDiscards({
            discardedByCode: { coach_paused: 2, 'max_attempts:codigo_raro': 1 },
            totalDiscarded: 3,
            flushed: 4,
            surface: 'finish',
            extra: { planId: 'p1', targetDate: '2026-07-21' },
        })

        expect(captureMessage).toHaveBeenCalledTimes(2)
        expect(captureMessage).toHaveBeenNthCalledWith(1, 'workout-offline-queue: descarte coach_paused', {
            level: 'warning',
            tags: { area: 'workout-offline-queue', surface: 'finish', discard_code: 'coach_paused' },
            extra: { discarded: 2, totalDiscarded: 3, flushed: 4, planId: 'p1', targetDate: '2026-07-21' },
            fingerprint: ['workout-offline-queue', 'discard', 'coach_paused'],
        })
        expect(captureMessage).toHaveBeenNthCalledWith(
            2,
            'workout-offline-queue: descarte max_attempts:codigo_raro',
            {
                level: 'warning',
                tags: {
                    area: 'workout-offline-queue',
                    surface: 'finish',
                    discard_code: 'max_attempts:codigo_raro',
                },
                extra: { discarded: 1, totalDiscarded: 3, flushed: 4, planId: 'p1', targetDate: '2026-07-21' },
                fingerprint: ['workout-offline-queue', 'discard', 'max_attempts:codigo_raro'],
            },
        )
    })

    it('no emite nada cuando no hubo descartes (flush sano = cero ruido)', () => {
        reportWorkoutQueueDiscards({
            discardedByCode: {},
            totalDiscarded: 0,
            flushed: 7,
            surface: 'layout-sync',
        })
        expect(captureMessage).not.toHaveBeenCalled()
    })
})
