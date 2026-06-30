import { describe, it, expect } from 'vitest'
import {
    computeEffectiveTarget,
    normalizeProgressionMode,
    parseRepsTop,
    DEFAULT_PROGRESSION_MODE,
    type ProgressionBlockInput,
} from './progression'

const weightBlock = (over: Partial<ProgressionBlockInput> = {}): ProgressionBlockInput => ({
    target_weight_kg: 50,
    progression_type: 'weight',
    progression_value: 2.5,
    progression_mode: 'weekly_linear',
    ...over,
})

describe('normalizeProgressionMode', () => {
    it('cae al default ante null/desconocido', () => {
        expect(normalizeProgressionMode(null)).toBe(DEFAULT_PROGRESSION_MODE)
        expect(normalizeProgressionMode(undefined)).toBe(DEFAULT_PROGRESSION_MODE)
        expect(normalizeProgressionMode('garbage')).toBe(DEFAULT_PROGRESSION_MODE)
    })
    it('respeta un modo válido', () => {
        expect(normalizeProgressionMode('double')).toBe('double')
    })
})

describe('computeEffectiveTarget — weekly_linear', () => {
    it('semana 1 = base (added 0, no progresado)', () => {
        const r = computeEffectiveTarget(weightBlock(), { currentWeek: 1, weeksToRepeat: 8 })
        expect(r.weightKg).toBe(50)
        expect(r.addedKg).toBe(0)
        expect(r.weeksApplied).toBe(0)
        expect(r.isProgressed).toBe(false)
        expect(r.modeImplemented).toBe(true)
    })

    it('semana 3 = base + 2 × incremento', () => {
        const r = computeEffectiveTarget(weightBlock(), { currentWeek: 3, weeksToRepeat: 8 })
        expect(r.weightKg).toBe(55) // 50 + 2*2.5
        expect(r.addedKg).toBe(5)
        expect(r.weeksApplied).toBe(2)
        expect(r.isProgressed).toBe(true)
    })

    it('capa al largo del programa (weeks_to_repeat)', () => {
        const r = computeEffectiveTarget(weightBlock(), { currentWeek: 99, weeksToRepeat: 4 })
        // cap=4 → weeksApplied=3 → 50 + 3*2.5 = 57.5
        expect(r.weightKg).toBe(57.5)
        expect(r.weeksApplied).toBe(3)
    })

    it('redondea a 0.5 kg (incremento 1.25)', () => {
        const r = computeEffectiveTarget(weightBlock({ progression_value: 1.25 }), {
            currentWeek: 2,
            weeksToRepeat: 8,
        })
        // 50 + 1*1.25 = 51.25 → 51.5 (round a 0.5)
        expect(r.weightKg).toBe(51.5)
    })
})

describe('computeEffectiveTarget — no-op seguro', () => {
    it('progresión de reps → muestra base (motor v1 no toca reps)', () => {
        const r = computeEffectiveTarget(
            weightBlock({ progression_type: 'reps', progression_value: 1 }),
            { currentWeek: 5, weeksToRepeat: 8 }
        )
        expect(r.weightKg).toBe(50)
        expect(r.isProgressed).toBe(false)
    })

    it('sin progresión → base', () => {
        const r = computeEffectiveTarget(
            weightBlock({ progression_type: null, progression_value: null }),
            { currentWeek: 5, weeksToRepeat: 8 }
        )
        expect(r.weightKg).toBe(50)
    })

    it('base null → null (no inventa peso)', () => {
        const r = computeEffectiveTarget(weightBlock({ target_weight_kg: null }), {
            currentWeek: 5,
            weeksToRepeat: 8,
        })
        expect(r.weightKg).toBeNull()
        expect(r.isProgressed).toBe(false)
    })

    it('sin semana (start_date faltante) → base', () => {
        const r = computeEffectiveTarget(weightBlock(), { currentWeek: null, weeksToRepeat: 8 })
        expect(r.weightKg).toBe(50)
    })

    it('incremento 0 o negativo → base', () => {
        expect(computeEffectiveTarget(weightBlock({ progression_value: 0 }), { currentWeek: 3 }).weightKg).toBe(50)
        expect(computeEffectiveTarget(weightBlock({ progression_value: -2 }), { currentWeek: 3 }).weightKg).toBe(50)
    })

    it('modo sin motor (session_linear, reservado) → muestra base aunque haya progresión', () => {
        const r = computeEffectiveTarget(weightBlock({ progression_mode: 'session_linear' }), {
            currentWeek: 3,
            weeksToRepeat: 8,
        })
        expect(r.weightKg).toBe(50)
        expect(r.modeImplemented).toBe(false)
        expect(r.isProgressed).toBe(false)
    })

    it('modo null → default weekly_linear (progresa)', () => {
        const r = computeEffectiveTarget(weightBlock({ progression_mode: null }), {
            currentWeek: 3,
            weeksToRepeat: 8,
        })
        expect(r.weightKg).toBe(55)
        expect(r.mode).toBe('weekly_linear')
    })
})

describe('parseRepsTop', () => {
    it('rango "8-12" → 12', () => expect(parseRepsTop('8-12')).toBe(12))
    it('entero "10" → 10', () => expect(parseRepsTop('10')).toBe(10))
    it('con sufijo "10-12 por lado" → 12', () => expect(parseRepsTop('10-12 por lado')).toBe(12))
    it('AMRAP → null', () => expect(parseRepsTop('AMRAP')).toBeNull())
    it('vacío/null → null', () => {
        expect(parseRepsTop('')).toBeNull()
        expect(parseRepsTop(null)).toBeNull()
    })
})

describe('computeEffectiveTarget — double (doble progresión)', () => {
    const dbl = (over: Partial<ProgressionBlockInput> = {}): ProgressionBlockInput =>
        weightBlock({ progression_mode: 'double', reps: '8-12', sets: 3, ...over })

    it('primera vez (sin última sesión) → base, holding=false', () => {
        const r = computeEffectiveTarget(dbl(), { currentWeek: 1, lastSession: null })
        expect(r.weightKg).toBe(50)
        expect(r.status).toBe('flat')
        expect(r.repsTopToUnlock).toBe(12)
    })

    it('completó el tope en TODAS las series → sube desde el peso usado', () => {
        const r = computeEffectiveTarget(dbl(), {
            currentWeek: 4,
            lastSession: { weightKg: 50, repsDone: [12, 12, 12] },
        })
        expect(r.weightKg).toBe(52.5) // 50 + 2.5
        expect(r.status).toBe('progressed')
        expect(r.isProgressed).toBe(true)
    })

    it('NO completó (una serie corta) → mantiene el peso de la última sesión', () => {
        const r = computeEffectiveTarget(dbl(), {
            currentWeek: 4,
            lastSession: { weightKg: 52.5, repsDone: [12, 12, 9] },
        })
        expect(r.weightKg).toBe(52.5)
        expect(r.status).toBe('holding')
        expect(r.holding).toBe(true)
    })

    it('faltan series registradas (hizo 2 de 3) → mantiene (no sube)', () => {
        const r = computeEffectiveTarget(dbl(), {
            currentWeek: 4,
            lastSession: { weightKg: 50, repsDone: [12, 12] },
        })
        expect(r.weightKg).toBe(50)
        expect(r.status).toBe('holding')
    })

    it('ancla en lo REAL: subió de más → progresa desde ahí', () => {
        const r = computeEffectiveTarget(dbl(), {
            currentWeek: 4,
            lastSession: { weightKg: 60, repsDone: [12, 12, 12] },
        })
        expect(r.weightKg).toBe(62.5)
        expect(r.baseWeightKg).toBe(50)
        expect(r.addedKg).toBe(12.5)
    })

    it('sin rango de reps (AMRAP) → cae a weekly_linear', () => {
        const r = computeEffectiveTarget(dbl({ reps: 'AMRAP' }), {
            currentWeek: 3,
            weeksToRepeat: 8,
            lastSession: { weightKg: 50, repsDone: [99, 99, 99] },
        })
        expect(r.weightKg).toBe(55) // 50 + 2*2.5 (semana, no sesión)
        expect(r.mode).toBe('weekly_linear')
    })
})
