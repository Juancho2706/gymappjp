// Helpers PUROS de la vista de nutrición del alumno en RN (apps/mobile/lib/nutrition-v2-plan).
// El módulo no toca supabase ni react-native, así que corre con el runner del repo (glob `tests/**`).
//
// NOTES-RN: espeja el bloque `resolveItemDisplayNote` de
// `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.test.ts` — la
// regla de "qué nota ve el alumno bajo un item prescrito" ahora es UNA sola función compartida
// (`@eva/nutrition-v2/plan-substitutions`) y la pantalla RN la consume por este módulo, en vez de
// la condición inline con `startsWith('Alternativas:')` que vivía dentro del render.
import { describe, it, expect } from 'vitest'
import {
  describeItemGuidance,
  resolveItemDisplayNote,
  type PlanItemGuidance,
} from '../../apps/mobile/lib/nutrition-v2-plan'

function item(overrides: Partial<PlanItemGuidance> = {}): PlanItemGuidance {
  return { unit: 'g', minimumQuantity: null, maximumQuantity: null, notes: null, ...overrides }
}

describe('resolveItemDisplayNote (RN, "Hoy")', () => {
  it('con reemplazos estructurados calla el texto legado "Alternativas: …"', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atún', true)).toBeNull()
  })

  it('sin reemplazos estructurados conserva el texto legado completo', () => {
    expect(resolveItemDisplayNote('Alternativas: Pavo, Atún', false)).toBe('Alternativas: Pavo, Atún')
  })

  it('cualquier otra nota del coach se conserva aunque haya reemplazos', () => {
    expect(resolveItemDisplayNote('Cocinar a la plancha', true)).toBe('Cocinar a la plancha')
  })

  it('sin nota (null, undefined o solo espacios) no pinta nada', () => {
    expect(resolveItemDisplayNote(null, true)).toBeNull()
    expect(resolveItemDisplayNote(undefined, false)).toBeNull()
    expect(resolveItemDisplayNote('   ', false)).toBeNull()
  })
})

describe('describeItemGuidance (RN, "Plan")', () => {
  it('sin rango ni nota no pinta guía', () => {
    expect(describeItemGuidance(item())).toBeNull()
  })

  it('con nota y sin rango devuelve la nota tal cual', () => {
    expect(describeItemGuidance(item({ notes: 'Cocinar a la plancha' }))).toBe('Cocinar a la plancha')
  })

  it('encadena el rango ajustable con la nota', () => {
    expect(
      describeItemGuidance(
        item({ minimumQuantity: 80, maximumQuantity: 120, notes: 'Cocinar a la plancha' }),
      ),
    ).toBe('Ajustable entre 80 g y 120 g · Cocinar a la plancha')
  })

  it('solo máximo ⇒ "Hasta X"; solo mínimo ⇒ "Desde X"', () => {
    expect(describeItemGuidance(item({ maximumQuantity: 120 }))).toBe('Hasta 120 g')
    expect(describeItemGuidance(item({ minimumQuantity: 80 }))).toBe('Desde 80 g')
  })

  it('SUB-T10: con reemplazos estructurados el rango sobrevive y la nota legada se calla', () => {
    const legacy = item({ minimumQuantity: 80, maximumQuantity: 120, notes: 'Alternativas: Pavo, Atún' })
    expect(describeItemGuidance(legacy, false)).toBe(
      'Ajustable entre 80 g y 120 g · Alternativas: Pavo, Atún',
    )
    expect(describeItemGuidance(legacy, true)).toBe('Ajustable entre 80 g y 120 g')
    expect(describeItemGuidance(item({ notes: 'Alternativas: Pavo, Atún' }), true)).toBeNull()
  })
})
