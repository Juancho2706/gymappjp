/**
 * Peso objetivo del builder en la unidad del bloque (tren kg-lb-ejecutor, D3 = a).
 *
 * `target_weight_kg` es SIEMPRE kilos (lo leen el ejecutor, la progresión y la ficha). La libra existe
 * solo en lo que el coach ve y teclea cuando el bloque está en `load_unit = 'lb'`: el campo muestra el
 * número convertido y guarda kilos a centésimas (`weightToKg`). En kg todo queda como siempre (el string
 * crudo que tecleó el coach).
 */
import { formatWeightEsCl, parseWeightEsCl, weightFromKg, type WeightUnit } from '@eva/workout-engine'

interface WeightLike {
    target_weight_kg?: string | null
    load_unit?: string | null
}

/** Unidad en que el coach ve el peso del bloque. Todo lo que no sea `lb` es kilos (`sec` incluido). */
export function builderWeightUnit(block: WeightLike): WeightUnit {
    return block.load_unit === 'lb' ? 'lb' : 'kg'
}

/** Número que muestra el input del peso objetivo (kg ⇒ el string crudo de siempre). */
export function targetWeightInputValue(block: WeightLike): string {
    const raw = block.target_weight_kg ?? ''
    if (builderWeightUnit(block) === 'kg') return raw
    const kg = parseWeightEsCl(raw)
    return kg == null ? '' : String(weightFromKg(kg, 'lb'))
}

/**
 * Rótulo «60 kg» / «132,5 lb» para vista previa e impresión. `null` sin peso. En kg conserva el string
 * crudo (idéntico a lo que se pintaba antes del tren).
 */
export function targetWeightLabel(block: WeightLike): string | null {
    const raw = String(block.target_weight_kg ?? '').trim()
    if (!raw) return null
    if (builderWeightUnit(block) === 'kg') return `${raw} kg`
    const kg = parseWeightEsCl(raw)
    return kg == null ? `${raw} kg` : `${formatWeightEsCl(weightFromKg(kg, 'lb'))} lb`
}
