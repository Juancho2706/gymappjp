import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

/**
 * W7.1 — `coach_registered` no se puede contar dos veces.
 *
 * El alta por Google en la web tiene DOS emisores posibles: el Server Action (que sale aunque el
 * visitante no acepte cookies, y es el que lleva `platform`/`method`) y este tracker en el
 * aterrizaje. El contrato es el flag `?ph=srv` en la URL: si está, el navegador se calla.
 */

/** Espejo de la firma real de `useCaptureRegistration` (devuelve el CaptureResult de posthog). */
type CaptureRegistration = (tier: string, method: string, billingCycle?: string) => { uuid: string }

const captureMock = vi.hoisted(() => vi.fn<CaptureRegistration>(() => ({ uuid: 'evt' })))
vi.mock('@/lib/posthog/events', () => ({ useCaptureRegistration: () => captureMock }))

import { CoachRegisteredTracker } from './RegistrationTracker'

function landOn(url: string) {
    window.history.replaceState({}, '', url)
}

beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    landOn('/verify-email?email=a%40b.cl&eid=evt-1')
})

afterEach(() => {
    cleanup()
})

describe('CoachRegisteredTracker', () => {
    it('aterrizaje normal: emite el alta con el método del mount', () => {
        render(<CoachRegisteredTracker tier="free" dedupeKey="evt-1" />)

        expect(captureMock).toHaveBeenCalledTimes(1)
        expect(captureMock).toHaveBeenCalledWith('free', 'email', undefined)
    })

    it('con `?ph=srv` NO emite: el evento ya salió del servidor', () => {
        landOn('/coach/dashboard?welcome=free&eid=evt-1&ph=srv')

        render(<CoachRegisteredTracker tier="free" dedupeKey="evt-1" method="google" />)

        expect(captureMock).not.toHaveBeenCalled()
    })

    it('un `ph` con otro valor no apaga nada (el flag es exacto)', () => {
        landOn('/coach/dashboard?welcome=free&eid=evt-1&ph=1')

        render(<CoachRegisteredTracker tier="free" dedupeKey="evt-1" />)

        expect(captureMock).toHaveBeenCalledTimes(1)
    })

    it('recargar el aterrizaje no vuelve a contar el alta (dedupe por `eid`)', () => {
        render(<CoachRegisteredTracker tier="free" dedupeKey="evt-1" />)
        cleanup()
        render(<CoachRegisteredTracker tier="free" dedupeKey="evt-1" />)

        expect(captureMock).toHaveBeenCalledTimes(1)
    })
})
