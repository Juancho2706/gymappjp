import { describe, expect, it } from 'vitest'
import { builderWeightUnit, targetWeightInputValue, targetWeightLabel } from './target-weight'

/** Tren kg-lb-ejecutor (D3 = a): el builder guarda kilos y muestra la unidad del bloque. */
describe('peso objetivo del builder en la unidad del bloque', () => {
    it('todo lo que no sea lb es kilos (sec, null y vacío incluidos)', () => {
        expect(builderWeightUnit({ load_unit: 'lb' })).toBe('lb')
        expect(builderWeightUnit({ load_unit: 'kg' })).toBe('kg')
        expect(builderWeightUnit({ load_unit: 'sec' })).toBe('kg')
        expect(builderWeightUnit({ load_unit: null })).toBe('kg')
        expect(builderWeightUnit({})).toBe('kg')
    })

    it('en kg el input y el rótulo son el string crudo de siempre', () => {
        expect(targetWeightInputValue({ target_weight_kg: '62.5', load_unit: 'kg' })).toBe('62.5')
        expect(targetWeightLabel({ target_weight_kg: '62.5', load_unit: null })).toBe('62.5 kg')
        expect(targetWeightLabel({ target_weight_kg: '', load_unit: 'kg' })).toBeNull()
    })

    it('en lb los kilos guardados se ven en libras (ida y vuelta exacta)', () => {
        expect(targetWeightInputValue({ target_weight_kg: '20.41', load_unit: 'lb' })).toBe('45')
        expect(targetWeightInputValue({ target_weight_kg: '60.1', load_unit: 'lb' })).toBe('132.5')
        expect(targetWeightLabel({ target_weight_kg: '20.41', load_unit: 'lb' })).toBe('45 lb')
        expect(targetWeightInputValue({ target_weight_kg: '', load_unit: 'lb' })).toBe('')
    })
})
