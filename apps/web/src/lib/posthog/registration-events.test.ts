import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W7.1 — el emisor server-side de `coach_registered`.
 *
 * Lo que se pinnea acá es el CONTRATO del evento: el `distinct_id` es el coach (nunca su email),
 * las cinco propiedades del embudo viajan siempre y no se cuela PII en el payload.
 */

type CaptureInput = { event: string; distinctId: string; properties?: Record<string, unknown> }

const captureMock = vi.hoisted(() => vi.fn<(input: CaptureInput) => Promise<void>>(async () => {}))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))

import { captureCoachRegisteredServer } from './registration-events'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('captureCoachRegisteredServer', () => {
    it('manda `coach_registered` con plataforma, método y versión de catálogo', async () => {
        await captureCoachRegisteredServer({
            coachId: 'coach-1',
            tier: 'free',
            method: 'google',
            platform: 'android',
        })

        expect(captureMock).toHaveBeenCalledWith({
            event: 'coach_registered',
            distinctId: 'coach-1',
            properties: {
                tier: 'free',
                billing_cycle: null,
                method: 'google',
                platform: 'android',
                pricing_version: 'v3',
                source: 'server',
            },
        })
    })

    it('`source: server` distingue esta fila de la del navegador (detector de duplicados)', async () => {
        await captureCoachRegisteredServer({
            coachId: 'coach-2',
            tier: 'pro',
            method: 'email',
            platform: 'ios',
            billingCycle: 'monthly',
        })

        expect(captureMock).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    source: 'server',
                    billing_cycle: 'monthly',
                    platform: 'ios',
                }),
            })
        )
    })

    it('cero PII: el payload no lleva email ni nombre', async () => {
        await captureCoachRegisteredServer({
            coachId: 'coach-3',
            tier: 'free',
            method: 'email',
            platform: 'unknown',
        })

        expect(JSON.stringify(captureMock.mock.calls)).not.toMatch(/@/)
    })
})
