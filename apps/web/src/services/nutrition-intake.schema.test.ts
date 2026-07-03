import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { INTAKE_SOURCES } from './nutrition-intake.service'

/**
 * Guardia de drift codigo/DB para `source` de `nutrition_intake_entries`.
 *
 * La tabla tiene CHECK `source IN ('offplan','quickadd','recent','copy')`. La
 * action del alumno (`intake.actions.ts`) es 'use server' y NO se puede importar
 * desde un test, pero su schema deriva de `INTAKE_SOURCES`, la misma constante
 * que probamos aca. Si alguien vuelve a mandar 'manual' (el bug que reventaba el
 * insert por violacion de CHECK), este test se pone rojo.
 */
describe('INTAKE_SOURCES — source permitido de intake off-plan', () => {
  const sourceSchema = z.enum(INTAKE_SOURCES)

  it('acepta los valores del CHECK de la tabla', () => {
    expect(sourceSchema.safeParse('offplan').success).toBe(true)
    expect(sourceSchema.safeParse('recent').success).toBe(true)
    expect(sourceSchema.safeParse('quickadd').success).toBe(true)
    expect(sourceSchema.safeParse('copy').success).toBe(true)
  })

  it('rechaza "manual" (valor legacy que violaba el CHECK y rompia el insert)', () => {
    expect(sourceSchema.safeParse('manual').success).toBe(false)
    expect(sourceSchema.safeParse('recipe').success).toBe(false)
    expect(sourceSchema.safeParse('plan').success).toBe(false)
  })
})
