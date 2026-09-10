// N7 — gate del dominio de nutrición en el DIRECTORIO coach de RN (SPEC R4.13 / R4.14, TASKS A20/A21).
// Con el dominio apagado el directorio no puede dejar rastro de nutrición: el tile «Nutri.» sale de
// la grilla del resumen y el conteo del tile da 0 (el pill de la fila y el ícono de la tabla densa
// se gatean en presentación, sobre las mismas dos funciones puras que se prueban acá).
//
// El gate NO vive en `filterClients` (R8): ese contrato queda intacto y lo fija
// `tests/mobile-directory-pulse-parity.test.ts`.
//
// GOTCHA de resolución (mismo patrón que mobile-directory-pulse-parity.test.ts:16-28):
// clients-directory.ts importa supabase/api/coach/org (cadena react-native). Se mockean
// los paths REALES de esos módulos locales con vi.doMock + import() dinámico.
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileLib = (name: string) => path.resolve(__dirname, '..', 'apps', 'mobile', 'lib', name)

beforeEach(() => {
  vi.resetModules()
  vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: {} }))
  vi.doMock(mobileLib('coach.ts'), () => ({ getCoachProfile: vi.fn() }))
  vi.doMock(mobileLib('org.ts'), () => ({ getCoachOrgContext: vi.fn() }))
  vi.doMock(mobileLib('db-compat.ts'), () => ({ selectWithFallback: vi.fn() }))
  vi.doMock(mobileLib('api.ts'), () => ({ apiFetch: vi.fn() }))
})

async function loadLib() {
  return await import(mobileLib('clients-directory.ts'))
}

function pulse(partial: Record<string, unknown> & { clientId: string }) {
  return {
    percentage: 0,
    nutritionPercentage: 0,
    weightHistory30d: [],
    adherenceHistory4w: [],
    currentWeight: null,
    weightDelta7d: null,
    latestEnergyLevel: null,
    streak: 0,
    planCurrentWeek: null,
    planTotalWeeks: null,
    attentionScore: 0,
    attentionFlags: [],
    lastWorkoutDate: null,
    ...partial,
  }
}

/** Tres filas: dos con el flag NUTRICION_RIESGO y una con pct bajo SIN flag (no cuenta). */
function rows() {
  return [
    pulse({ clientId: 'a', attentionFlags: ['NUTRICION_RIESGO'], nutritionPercentage: 30 }),
    pulse({ clientId: 'b', attentionFlags: ['SIN_ENTRENOS', 'NUTRICION_RIESGO'], nutritionPercentage: 55 }),
    pulse({ clientId: 'c', attentionFlags: [], nutritionPercentage: 40 }),
  ]
}

describe('nutritionLowCountFor — conteo del tile «Nutri.» gateado por dominio', () => {
  it('con el dominio APAGADO devuelve 0 aunque haya filas con el flag', async () => {
    const lib = await loadLib()
    expect(lib.nutritionLowCountFor(rows(), false)).toBe(0)
  })

  it('con el dominio ENCENDIDO cuenta SOLO el flag NUTRICION_RIESGO (no el pct<60)', async () => {
    const lib = await loadLib()
    expect(lib.nutritionLowCountFor(rows(), true)).toBe(2)
  })

  it('acepta el iterable del Map del screen (pulseById.values()) y tolera attentionFlags ausente', async () => {
    const lib = await loadLib()
    const byId = new Map<string, unknown>([
      ['a', pulse({ clientId: 'a', attentionFlags: ['NUTRICION_RIESGO'] })],
      ['b', { ...pulse({ clientId: 'b' }), attentionFlags: undefined }],
    ])
    expect(lib.nutritionLowCountFor(byId.values(), true)).toBe(1)
    expect(lib.nutritionLowCountFor(byId.values(), false)).toBe(0)
  })

  it('sin filas de pulse da 0 en los dos estados del dominio', async () => {
    const lib = await loadLib()
    expect(lib.nutritionLowCountFor([], true)).toBe(0)
    expect(lib.nutritionLowCountFor([], false)).toBe(0)
  })
})

describe('summaryMetricKeys — grilla del «Resumen · hoy»', () => {
  it('con el dominio ENCENDIDO son los 4 tiles en orden, con Nutri. al final', async () => {
    const lib = await loadLib()
    expect(lib.summaryMetricKeys(true)).toEqual(['total', 'active', 'adherence', 'nutrition'])
  })

  it('con el dominio APAGADO la grilla queda de 3 y pierde «Nutri.»', async () => {
    const lib = await loadLib()
    const keys = lib.summaryMetricKeys(false)
    expect(keys).toEqual(['total', 'active', 'adherence'])
    expect(keys).not.toContain('nutrition')
    expect(keys).toHaveLength(3)
  })

  it('el orden de los tiles compartidos no cambia al apagar el dominio', async () => {
    const lib = await loadLib()
    expect(lib.summaryMetricKeys(true).slice(0, 3)).toEqual(lib.summaryMetricKeys(false))
  })
})
