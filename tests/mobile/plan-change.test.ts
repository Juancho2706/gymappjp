/**
 * Contrato PURO del cambio de plan en la app (`apps/mobile/lib/plan-change.ts`) — embudo Free→Pro W6.
 *
 * Dos cosas se pinnean acá porque romperlas cuesta caro y en silencio:
 *
 *  1. **Compliance de tiendas.** `planCaption('ios')` DEBE ser `undefined`. La regla del owner
 *     (SPEC §«Decisiones cerradas» 2 y 3) es que iOS no muestre ni una frase que apunte a pagar
 *     afuera; Android admite exactamente UNA línea sin link. Un `Platform.OS` mal ramificado no se
 *     ve en un diff, se ve en un rechazo de App Review.
 *  2. **La celebración no miente.** `detectPlanChange` decide si se le dice al coach «tu plan
 *     cambió». Un falso positivo (columna null leída como «ilimitado», bajada de tier leída como
 *     subida) celebra algo que no pasó.
 *
 * Sin react-native de por medio: el módulo es puro a propósito.
 */
import { describe, expect, it } from 'vitest'
import {
    detectPlanChange,
    formatUpdatedAgo,
    planCaption,
    STORE_PLAN_CHANGE_CAPTION,
    type PlanSnapshot,
} from '../../apps/mobile/lib/plan-change'

const snap = (tier: string, maxClients: number | null = null): PlanSnapshot => ({ tier, maxClients })

describe('planCaption — la línea de Android no puede filtrarse a iOS', () => {
    it('iOS: undefined (cero texto hacia pago, guideline 3.1.1)', () => {
        expect(planCaption('ios')).toBeUndefined()
    })

    it('Android: la única frase admitida, sin link', () => {
        expect(planCaption('android')).toBe('Los cambios de plan se hacen en eva-app.cl')
        // Un solo string en toda la app: el mismo que usa el muro de cupo (`lib/client-cap.ts`).
        expect(planCaption('android')).toBe(STORE_PLAN_CHANGE_CAPTION)
        // Texto plano: si algún día alguien la convierte en URL, esto lo caza.
        expect(STORE_PLAN_CHANGE_CAPTION).not.toMatch(/https?:\/\//)
    })

    it('cualquier otra plataforma (web, macos, windows) se comporta como iOS', () => {
        for (const platform of ['web', 'macos', 'windows', '']) {
            expect(planCaption(platform)).toBeUndefined()
        }
    })
})

describe('detectPlanChange — solo celebra lo que de verdad subió', () => {
    it('free → pro es tier_up', () => {
        const change = detectPlanChange(snap('free', 1), snap('pro', 25))
        expect(change.kind).toBe('tier_up')
        expect(change.from.tier).toBe('free')
        expect(change.to.maxClients).toBe(25)
    })

    it('starter → pro también es tier_up', () => {
        expect(detectPlanChange(snap('starter', 5), snap('pro', 25)).kind).toBe('tier_up')
    })

    it('pro → elite es tier_up', () => {
        expect(detectPlanChange(snap('pro', 25), snap('elite', 60)).kind).toBe('tier_up')
    })

    it('mismo tier con la columna de cupo más alta (grandfather v3) es cap_up', () => {
        const change = detectPlanChange(snap('free', 1), snap('free', 3))
        expect(change.kind).toBe('cap_up')
        expect(change.to.maxClients).toBe(3)
    })

    it('nada cambió ⇒ none', () => {
        expect(detectPlanChange(snap('pro', 25), snap('pro', 25)).kind).toBe('none')
    })

    it('bajada de tier ⇒ none, aunque la columna de cupo quedara más alta', () => {
        expect(detectPlanChange(snap('pro', 25), snap('free', 1)).kind).toBe('none')
        expect(detectPlanChange(snap('pro', 1), snap('free', 25)).kind).toBe('none')
    })

    it('cupo que BAJA ⇒ none', () => {
        expect(detectPlanChange(snap('free', 3), snap('free', 1)).kind).toBe('none')
    })

    it('null no es «ilimitado»: aparecer o desaparecer la columna NO celebra', () => {
        expect(detectPlanChange(snap('free', 1), snap('free', null)).kind).toBe('none')
        expect(detectPlanChange(snap('free', null), snap('free', 1)).kind).toBe('none')
        expect(detectPlanChange(snap('free', null), snap('free', null)).kind).toBe('none')
    })

    it('tier desconocido (columna stale) no dispara tier_up, pero el cupo sigue midiéndose', () => {
        expect(detectPlanChange(snap('legacy_x', 1), snap('pro', 25)).kind).toBe('cap_up')
        expect(detectPlanChange(snap('free', 1), snap('legacy_x', 1)).kind).toBe('none')
    })

    it('siempre devuelve las dos fotos, incluso en none (la UI las necesita para el copy)', () => {
        const from = snap('pro', 25)
        const to = snap('pro', 25)
        expect(detectPlanChange(from, to)).toEqual({ kind: 'none', from, to })
    })
})

describe('formatUpdatedAgo — «Actualizado hace X» sin librerías de fechas', () => {
    const T0 = 1_700_000_000_000

    it('sin refresco previo ⇒ null (no se pinta nada)', () => {
        expect(formatUpdatedAgo(null, T0)).toBeNull()
    })

    it('menos de un minuto ⇒ «recién»', () => {
        expect(formatUpdatedAgo(T0, T0)).toBe('Actualizado recién')
        expect(formatUpdatedAgo(T0, T0 + 59_000)).toBe('Actualizado recién')
    })

    it('minutos, horas y días', () => {
        expect(formatUpdatedAgo(T0, T0 + 2 * 60_000)).toBe('Actualizado hace 2 min')
        expect(formatUpdatedAgo(T0, T0 + 59 * 60_000)).toBe('Actualizado hace 59 min')
        expect(formatUpdatedAgo(T0, T0 + 3 * 3_600_000)).toBe('Actualizado hace 3 h')
        expect(formatUpdatedAgo(T0, T0 + 50 * 3_600_000)).toBe('Actualizado hace 2 d')
    })

    it('un reloj que corrió hacia atrás no imprime negativos', () => {
        expect(formatUpdatedAgo(T0, T0 - 10_000)).toBe('Actualizado recién')
    })
})
