import { describe, expect, it } from 'vitest'
import { tierMaxClientsFor } from '@/lib/constants'
import { effectiveTierLimit } from './effective-limit'

// Fechas ancla de la escalera de 3 peldaños (PRICING_V2_CUTOVER 2026-08-18 / PRICING_V3_CUTOVER
// 2026-08-21). No se hardcodean los números esperados: se comparan contra el helper de @eva/tiers
// para que el test no haya que reescribirlo cuando el catálogo cambie de nuevo.
const PRE_V2 = '2026-01-15T10:00:00.000Z'
const POST_V3 = '2026-08-25T10:00:00.000Z'

describe('effectiveTierLimit', () => {
    it('para el tier ACTUAL manda la columna, no la escalera de fecha', () => {
        // El caso que motivó el cambio: coach viejo en free con 3 alumnos. El backfill del día D lo
        // dejó con `max_clients = 3`; la página debe seguir diciendo «Free: hasta 3».
        expect(
            effectiveTierLimit({
                tier: 'free',
                currentTier: 'free',
                coachMaxClients: 3,
                coachCreatedAt: POST_V3,
            })
        ).toBe(3)
    })

    it('la columna gana incluso cuando es MENOR que la escalera (override manual hacia abajo)', () => {
        expect(
            effectiveTierLimit({
                tier: 'pro',
                currentTier: 'pro',
                coachMaxClients: 5,
                coachCreatedAt: PRE_V2,
            })
        ).toBe(5)
    })

    it('para los OTROS tiers proyecta con la escalera (lo que el write-path escribirá)', () => {
        // La columna del coach es la de su plan actual: aplicarla a un plan que no tiene mentiría.
        expect(
            effectiveTierLimit({
                tier: 'pro',
                currentTier: 'free',
                coachMaxClients: 3,
                coachCreatedAt: PRE_V2,
            })
        ).toBe(tierMaxClientsFor('pro', PRE_V2))
    })

    it('sin columna usable cae a la escalera aunque el tier sea el actual', () => {
        for (const coachMaxClients of [null, undefined, Number.NaN, -1]) {
            expect(
                effectiveTierLimit({
                    tier: 'free',
                    currentTier: 'free',
                    coachMaxClients,
                    coachCreatedAt: POST_V3,
                })
            ).toBe(tierMaxClientsFor('free', POST_V3))
        }
    })

    it('coach nuevo sin columna ve el catálogo v3 en free (1 alumno)', () => {
        expect(
            effectiveTierLimit({
                tier: 'free',
                currentTier: 'free',
                coachMaxClients: null,
                coachCreatedAt: POST_V3,
            })
        ).toBe(1)
    })

    it('fecha ausente ⇒ fail-safe generoso (límites viejos), igual que tierMaxClientsFor', () => {
        expect(
            effectiveTierLimit({ tier: 'free', currentTier: 'pro', coachMaxClients: 25, coachCreatedAt: null })
        ).toBe(tierMaxClientsFor('free', null))
    })
})
