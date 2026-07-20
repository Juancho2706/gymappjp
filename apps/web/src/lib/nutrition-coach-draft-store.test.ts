import { describe, it, expect, beforeEach } from 'vitest'
import {
    quickEditDraftKey,
    builderDraftKey,
    readNutritionDraft,
    writeNutritionDraft,
    clearNutritionDraft,
    sweepStaleNutritionDrafts,
    NUTRITION_DRAFT_MAX_AGE_MS,
} from './nutrition-coach-draft-store'

const CLIENT = 'client-1'
const NOW = 1_000_000

beforeEach(() => {
    localStorage.clear()
})

describe('keys', () => {
    it('quick-edit key incluye el clientId', () => {
        expect(quickEditDraftKey(CLIENT)).toBe('eva:nutrition-qe-draft:client-1')
    })

    it('builder key incluye clientId Y planId (o "new" si es plan nuevo)', () => {
        expect(builderDraftKey(CLIENT, 'plan-9')).toBe('eva:nutrition-builder-draft:client-1:plan-9')
        expect(builderDraftKey(CLIENT, null)).toBe('eva:nutrition-builder-draft:client-1:new')
    })
})

describe('write / read round-trip', () => {
    it('persiste el payload con sobre v:1 y lo devuelve intacto', () => {
        const payload = { planId: 'p1', state: { variants: [{ key: 'v1' }] } }
        expect(writeNutritionDraft(quickEditDraftKey(CLIENT), payload, NOW)).toBe(true)
        const record = readNutritionDraft<typeof payload>(quickEditDraftKey(CLIENT), NOW + 1)
        expect(record).toEqual({ v: 1, savedAt: NOW, payload })
    })

    it('devuelve null si no hay borrador', () => {
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW)).toBeNull()
    })

    it('devuelve null ante basura no-JSON o sobre de version desconocida', () => {
        localStorage.setItem(quickEditDraftKey(CLIENT), 'no-json{')
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW)).toBeNull()
        localStorage.setItem(quickEditDraftKey(CLIENT), JSON.stringify({ v: 2, savedAt: NOW, payload: {} }))
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW)).toBeNull()
    })

    it('devuelve null cuando el borrador vencio su edad maxima', () => {
        writeNutritionDraft(quickEditDraftKey(CLIENT), { a: 1 }, NOW)
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW + NUTRITION_DRAFT_MAX_AGE_MS - 1)).not.toBeNull()
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW + NUTRITION_DRAFT_MAX_AGE_MS)).toBeNull()
    })

    it('no escribe payloads que exceden el tope de tamano', () => {
        const huge = { blob: 'x'.repeat(460_000) }
        expect(writeNutritionDraft(quickEditDraftKey(CLIENT), huge, NOW)).toBe(false)
        expect(localStorage.getItem(quickEditDraftKey(CLIENT))).toBeNull()
    })
})

describe('clearNutritionDraft', () => {
    it('borra el borrador indicado sin tocar otros', () => {
        writeNutritionDraft(quickEditDraftKey(CLIENT), { a: 1 }, NOW)
        writeNutritionDraft(builderDraftKey(CLIENT, null), { b: 2 }, NOW)
        clearNutritionDraft(quickEditDraftKey(CLIENT))
        expect(readNutritionDraft(quickEditDraftKey(CLIENT), NOW)).toBeNull()
        expect(readNutritionDraft(builderDraftKey(CLIENT, null), NOW)).not.toBeNull()
    })
})

describe('sweepStaleNutritionDrafts', () => {
    it('barre vencidos y basura de ambos prefijos, conserva vigentes y keys ajenas', () => {
        writeNutritionDraft(quickEditDraftKey('c-viejo'), { a: 1 }, NOW - NUTRITION_DRAFT_MAX_AGE_MS)
        writeNutritionDraft(builderDraftKey('c-viejo', 'p'), { b: 2 }, NOW - NUTRITION_DRAFT_MAX_AGE_MS)
        writeNutritionDraft(quickEditDraftKey('c-vigente'), { c: 3 }, NOW - 1000)
        localStorage.setItem(builderDraftKey('c-basura', null), '{{{')
        localStorage.setItem('eva:workout-draft:plan-x', JSON.stringify({ ajeno: true }))

        sweepStaleNutritionDrafts(NOW)

        expect(localStorage.getItem(quickEditDraftKey('c-viejo'))).toBeNull()
        expect(localStorage.getItem(builderDraftKey('c-viejo', 'p'))).toBeNull()
        expect(localStorage.getItem(builderDraftKey('c-basura', null))).toBeNull()
        expect(readNutritionDraft(quickEditDraftKey('c-vigente'), NOW)).not.toBeNull()
        expect(localStorage.getItem('eva:workout-draft:plan-x')).not.toBeNull()
    })
})
