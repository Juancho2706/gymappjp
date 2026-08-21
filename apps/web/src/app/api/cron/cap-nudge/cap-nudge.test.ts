import { describe, expect, it } from 'vitest'
import {
    CAP_NUDGE_MAX_TOUCHES,
    CAP_NUDGE_SCHEDULE_DAYS,
    CAP_NUDGE_TIERS,
    LADDER_TOLERANCE_MS,
    isAtCap,
    resolveCapNudgeDecision,
    type CapNudgePriorSend,
} from './cap-nudge'

// Núcleo puro del barrido de cupo. Lo que se pinnea acá es la CADENCIA: con Free = 1 alumno hay
// coaches «en cupo» de forma permanente, así que el tope de 3 toques por nivel de cupo y el reset
// al subir de plan son la diferencia entre un canal de venta y spam diario.

const NOW = new Date('2026-08-21T13:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 60 * 1000).toISOString()
const prior = (n: number, currentLimit: number | null = 1): CapNudgePriorSend => ({
    sentAt: daysAgo(n),
    currentLimit,
})

describe('constantes de la escalera', () => {
    it('solo barre free y tiene 3 peldaños en 0/7/28 días', () => {
        expect([...CAP_NUDGE_TIERS]).toEqual(['free'])
        expect([...CAP_NUDGE_SCHEDULE_DAYS]).toEqual([0, 7, 28])
        expect(CAP_NUDGE_MAX_TOUCHES).toBe(3)
        expect(LADDER_TOLERANCE_MS).toBe(12 * 60 * 60 * 1000)
    })
})

describe('isAtCap', () => {
    it('0 de 1 → no está en cupo', () => {
        expect(isAtCap({ activeCount: 0, maxClients: 1 })).toBe(false)
    })
    it('1 de 1 → está en cupo', () => {
        expect(isAtCap({ activeCount: 1, maxClients: 1 })).toBe(true)
    })
    it('2 de 1 (grandfather por encima del cupo) → está en cupo', () => {
        expect(isAtCap({ activeCount: 2, maxClients: 1 })).toBe(true)
    })
    it('cupo 0 (dato roto) → nunca en cupo', () => {
        expect(isAtCap({ activeCount: 5, maxClients: 0 })).toBe(false)
    })
})

describe('resolveCapNudgeDecision — escalera 0 / 7 / 28', () => {
    it('sin envíos previos → primer toque', () => {
        expect(resolveCapNudgeDecision({ priorSends: [], currentLimit: 1, now: NOW })).toEqual({
            action: 'send',
            touch: 1,
            reason: 'first_touch',
        })
    })

    it('1 previo hace 2 días → todavía no toca (gap de 7)', () => {
        const d = resolveCapNudgeDecision({ priorSends: [prior(2)], currentLimit: 1, now: NOW })
        expect(d).toMatchObject({ action: 'skip', reason: 'ladder_not_due' })
    })

    it('1 previo hace 8 días → segundo toque', () => {
        expect(resolveCapNudgeDecision({ priorSends: [prior(8)], currentLimit: 1, now: NOW })).toEqual({
            action: 'send',
            touch: 2,
            reason: 'ladder_due',
        })
    })

    it('previo hace 6 d 23 h → la escalera es en DÍAS: ya es el día 7, manda', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [{ sentAt: hoursAgo(6 * 24 + 23), currentLimit: 1 }],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toEqual({ action: 'send', touch: 2, reason: 'ladder_due' })
    })

    it('previo hace 6 d 11 h → fuera de la tolerancia de 12 h, todavía no toca', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [{ sentAt: hoursAgo(6 * 24 + 11), currentLimit: 1 }],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toMatchObject({ action: 'skip', reason: 'ladder_not_due', touch: 2 })
    })

    it('2 previos con el último hace 10 días → todavía no toca (gap de 21)', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(31), prior(10)],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toMatchObject({ action: 'skip', reason: 'ladder_not_due' })
    })

    it('2 previos con el último hace 22 días → tercer toque', () => {
        expect(
            resolveCapNudgeDecision({ priorSends: [prior(29), prior(22)], currentLimit: 1, now: NOW })
        ).toEqual({ action: 'send', touch: 3, reason: 'ladder_due' })
    })

    it('3 previos del mismo cupo → silencio para siempre (tope)', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(60), prior(40), prior(30)],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toMatchObject({ action: 'skip', reason: 'max_touches', touch: 3 })
    })
})

describe('resolveCapNudgeDecision — nivel de cupo y datos sucios', () => {
    it('3 previos de OTRO cupo (el coach subió de plan) → la escalera se reinicia', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(60, 1), prior(40, 1), prior(30, 1)],
            currentLimit: 25,
            now: NOW,
        })
        expect(d).toEqual({ action: 'send', touch: 1, reason: 'first_touch' })
    })

    it('previos con current_limit null (ledger viejo) CUENTAN — criterio conservador', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(60, null), prior(40, null), prior(30, null)],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toMatchObject({ action: 'skip', reason: 'max_touches' })
    })

    it('mezcla: cuenta los del mismo cupo + los null, ignora los de otro cupo', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(60, 25), prior(40, null), prior(2, 1)],
            currentLimit: 1,
            now: NOW,
        })
        // 2 toques contados, el último hace 2 días ⇒ falta para el gap de 21.
        expect(d).toMatchObject({ action: 'skip', reason: 'ladder_not_due', touch: 3 })
    })

    it('sentAt inválido se ignora (no cuenta como toque ni ancla el gap)', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [{ sentAt: 'no-es-fecha', currentLimit: 1 }],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toEqual({ action: 'send', touch: 1, reason: 'first_touch' })
    })

    it('el gap se mide contra el envío MÁS RECIENTE, sin importar el orden de la lista', () => {
        const d = resolveCapNudgeDecision({
            priorSends: [prior(1), prior(40)],
            currentLimit: 1,
            now: NOW,
        })
        expect(d).toMatchObject({ action: 'skip', reason: 'ladder_not_due' })
    })
})
