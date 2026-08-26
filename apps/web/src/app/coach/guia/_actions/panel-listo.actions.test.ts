import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock, revalidatePathMock, setCoachDomainEnabledMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    setCoachDomainEnabledMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }))
vi.mock('@/services/coach/persona.service', () => ({
    setCoachDomainEnabled: setCoachDomainEnabledMock,
}))

import { savePanelListoDomainsAction } from './panel-listo.actions'

/**
 * Modal «Tu panel quedó listo 💪», ahora interactivo. Espejo de
 * `coach/settings/funciones/_actions/mi-panel.actions.test.ts`: lo que se prueba es que el lote
 * escriba por el MISMO servicio que «Mi panel», que la cuenta administrada por org/team no pueda
 * escribir nada, y que un fallo parcial no cancele el resto ni mienta al coach.
 */

function setup(subscriptionStatus = 'active') {
    const supabase = {
        auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: 'coach-1' } } })) },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                        data: { id: 'coach-1', subscription_status: subscriptionStatus },
                    })),
                })),
            })),
        })),
    }
    createClientMock.mockResolvedValue(supabase)
    setCoachDomainEnabledMock.mockResolvedValue({ ok: true })
    return supabase
}

describe('savePanelListoDomainsAction', () => {
    beforeEach(() => vi.clearAllMocks())

    it('escribe solo los dominios recibidos y revalida el shell del coach', async () => {
        const supabase = setup()

        const result = await savePanelListoDomainsAction({
            changes: [
                { domain: 'cardio', enabled: true },
                { domain: 'nutrition', enabled: false },
            ],
        })

        expect(result).toEqual({ ok: true, saved: 2 })
        expect(setCoachDomainEnabledMock).toHaveBeenCalledTimes(2)
        expect(setCoachDomainEnabledMock).toHaveBeenNthCalledWith(1, supabase, 'coach-1', 'cardio', true)
        expect(setCoachDomainEnabledMock).toHaveBeenNthCalledWith(2, supabase, 'coach-1', 'nutrition', false)
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/settings')
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/dashboard', 'layout')
    })

    it('un lote vacío es input inválido: no escribe ni revalida', async () => {
        setup()

        const result = await savePanelListoDomainsAction({ changes: [] })

        expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
        expect(setCoachDomainEnabledMock).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('un dominio que no existe se rechaza entero (no se guarda «lo que se pueda»)', async () => {
        setup()

        const result = await savePanelListoDomainsAction({
            changes: [
                { domain: 'nutrition', enabled: false },
                { domain: 'inventado' as 'cardio', enabled: true },
            ],
        })

        expect(result).toEqual({ ok: false, error: 'Datos inválidos.' })
        expect(setCoachDomainEnabledMock).not.toHaveBeenCalled()
    })

    it('el mismo dominio repetido gana con su último valor y cuenta una sola vez', async () => {
        setup()

        const result = await savePanelListoDomainsAction({
            changes: [
                { domain: 'cardio', enabled: true },
                { domain: 'cardio', enabled: false },
            ],
        })

        expect(result).toEqual({ ok: true, saved: 1 })
        expect(setCoachDomainEnabledMock).toHaveBeenCalledTimes(1)
        expect(setCoachDomainEnabledMock).toHaveBeenCalledWith(
            expect.anything(),
            'coach-1',
            'cardio',
            false,
        )
    })

    it('coach administrado por org/team: no se escribe nada', async () => {
        setup('org_managed')

        const result = await savePanelListoDomainsAction({
            changes: [{ domain: 'cardio', enabled: true }],
        })

        expect(result).toEqual({
            ok: false,
            error: 'Tu panel lo administra tu organización o tu equipo.',
        })
        expect(setCoachDomainEnabledMock).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('sin sesión: mensaje accionable y ningún write', async () => {
        createClientMock.mockResolvedValue({
            auth: { getClaims: vi.fn(async () => ({ data: { claims: {} } })) },
            from: vi.fn(),
        })

        const result = await savePanelListoDomainsAction({
            changes: [{ domain: 'cardio', enabled: true }],
        })

        expect(result).toEqual({ ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' })
        expect(setCoachDomainEnabledMock).not.toHaveBeenCalled()
    })

    it('si un dominio falla, el resto IGUAL se guarda y el coach ve que puede reintentar', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        setup()
        setCoachDomainEnabledMock
            .mockResolvedValueOnce({ ok: false, error: 'permission denied' })
            .mockResolvedValueOnce({ ok: true })

        const result = await savePanelListoDomainsAction({
            changes: [
                { domain: 'cardio', enabled: true },
                { domain: 'movement', enabled: true },
            ],
        })

        expect(setCoachDomainEnabledMock).toHaveBeenCalledTimes(2)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('Inténtalo de nuevo')
        // Lo que sí se guardó ya cambió el menú: el shell se revalida igual.
        expect(revalidatePathMock).toHaveBeenCalledWith('/coach/settings')
        spy.mockRestore()
    })
})
