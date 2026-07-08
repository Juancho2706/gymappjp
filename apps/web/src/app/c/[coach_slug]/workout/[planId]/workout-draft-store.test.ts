import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    draftStoreKey,
    readDraft,
    saveDraft,
    clearDraft,
    clearAllDrafts,
    sweepStaleDrafts,
    DEFAULT_DRAFT_MAX_AGE_MS,
} from './workout-draft-store'

const PLAN = 'plan-abc'
const B1 = 'block-1'
const B2 = 'block-2'

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('draftStoreKey', () => {
    it('compone la clave con prefijo y plan', () => {
        expect(draftStoreKey(PLAN)).toBe('eva:workout-draft:plan-abc')
    })
})

describe('saveDraft / readDraft', () => {
    it('round-trip: guarda strings crudos (coma es-CL preservada) y los lee de vuelta', () => {
        saveDraft(PLAN, B1, 1, { w: '62,5', r: '8', rpe: '8', rir: '2', note: 'hombro' }, 1000)
        expect(readDraft(PLAN, B1, 1)).toEqual({ w: '62,5', r: '8', rpe: '8', rir: '2', note: 'hombro', ts: 1000 })
    })

    it('devuelve null si no hay borrador de esa serie', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        expect(readDraft(PLAN, B1, 2)).toBeNull()
        expect(readDraft(PLAN, B2, 1)).toBeNull()
        expect(readDraft('otro-plan', B1, 1)).toBeNull()
    })

    it('MERGE por campo: guardar kg y luego reps conserva ambos (y refresca ts)', () => {
        saveDraft(PLAN, B1, 1, { w: '80' }, 1000)
        saveDraft(PLAN, B1, 1, { r: '5' }, 2000)
        expect(readDraft(PLAN, B1, 1)).toEqual({ w: '80', r: '5', ts: 2000 })
    })

    it('MERGE sobrescribe sólo el campo provisto (no pisa los otros)', () => {
        saveDraft(PLAN, B1, 1, { w: '80', r: '5' }, 1000)
        saveDraft(PLAN, B1, 1, { w: '82,5' }, 2000)
        expect(readDraft(PLAN, B1, 1)).toEqual({ w: '82,5', r: '5', ts: 2000 })
    })

    it('aísla por (block,set): varias series coexisten en el mismo plan', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        saveDraft(PLAN, B1, 2, { w: '65' }, 1000)
        saveDraft(PLAN, B2, 1, { w: '100' }, 1000)
        expect(readDraft(PLAN, B1, 1)?.w).toBe('60')
        expect(readDraft(PLAN, B1, 2)?.w).toBe('65')
        expect(readDraft(PLAN, B2, 1)?.w).toBe('100')
    })

    it('saveDraft no propaga si setItem lanza (best-effort → false)', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded')
        })
        expect(saveDraft(PLAN, B1, 1, { w: '60' })).toBe(false)
    })

    it('readDraft no propaga si getItem lanza (best-effort → null)', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(readDraft(PLAN, B1, 1)).toBeNull()
    })

    it('devuelve null ante basura en el store (no-JSON / array)', () => {
        localStorage.setItem(draftStoreKey(PLAN), 'no-soy-json')
        expect(readDraft(PLAN, B1, 1)).toBeNull()
        localStorage.setItem(draftStoreKey(PLAN), '[1,2,3]')
        expect(readDraft(PLAN, B1, 1)).toBeNull()
    })
})

describe('clearDraft', () => {
    it('borra sólo la serie indicada y conserva las demás', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        saveDraft(PLAN, B1, 2, { w: '65' }, 1000)
        clearDraft(PLAN, B1, 1)
        expect(readDraft(PLAN, B1, 1)).toBeNull()
        expect(readDraft(PLAN, B1, 2)?.w).toBe('65')
    })

    it('al borrar la última serie elimina la clave del plan por completo', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        clearDraft(PLAN, B1, 1)
        expect(localStorage.getItem(draftStoreKey(PLAN))).toBeNull()
    })

    it('no-op si la serie no existe', () => {
        expect(() => clearDraft(PLAN, B1, 99)).not.toThrow()
    })
})

describe('clearAllDrafts', () => {
    it('borra todos los borradores del plan', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        saveDraft(PLAN, B2, 3, { r: '10' }, 1000)
        clearAllDrafts(PLAN)
        expect(localStorage.getItem(draftStoreKey(PLAN))).toBeNull()
        expect(readDraft(PLAN, B1, 1)).toBeNull()
    })

    it('no toca los borradores de OTRO plan', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        saveDraft('otro-plan', B1, 1, { w: '99' }, 1000)
        clearAllDrafts(PLAN)
        expect(readDraft('otro-plan', B1, 1)?.w).toBe('99')
    })

    it('no propaga si removeItem lanza', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('boom')
        })
        expect(() => clearAllDrafts(PLAN)).not.toThrow()
    })
})

describe('sweepStaleDrafts', () => {
    it('borra entradas más viejas que maxAge y conserva las recientes', () => {
        const now = 10 * DEFAULT_DRAFT_MAX_AGE_MS
        saveDraft(PLAN, B1, 1, { w: '60' }, now - DEFAULT_DRAFT_MAX_AGE_MS - 1) // vencida
        saveDraft(PLAN, B1, 2, { w: '65' }, now - 1000) // fresca
        sweepStaleDrafts(PLAN, now)
        expect(readDraft(PLAN, B1, 1)).toBeNull()
        expect(readDraft(PLAN, B1, 2)?.w).toBe('65')
    })

    it('respeta un maxAge custom', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        sweepStaleDrafts(PLAN, 1000 + 500, 100) // 500ms > 100ms → vencida
        expect(readDraft(PLAN, B1, 1)).toBeNull()
    })

    it('borra entradas con ts basura (no finito)', () => {
        localStorage.setItem(
            draftStoreKey(PLAN),
            JSON.stringify({ 'block-1:1': { w: '60', ts: 'nan' } }),
        )
        sweepStaleDrafts(PLAN, Date.now())
        expect(readDraft(PLAN, B1, 1)).toBeNull()
    })

    it('no propaga si localStorage lanza', () => {
        saveDraft(PLAN, B1, 1, { w: '60' }, 1000)
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('boom')
        })
        expect(() => sweepStaleDrafts(PLAN, 10 * DEFAULT_DRAFT_MAX_AGE_MS)).not.toThrow()
    })
})
