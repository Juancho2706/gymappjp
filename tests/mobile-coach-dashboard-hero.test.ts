/**
 * Stat «Adherencia» del hero del coach (`adherenceHeroStat` de `apps/mobile/lib/coach-dashboard`).
 *
 * Reporte del owner (10-09-2026): un coach recién registrado, con 0 alumnos reales, veía
 * «Adherencia 78 % · +2 pts» porque el KPI del server contaba al alumno de ejemplo. Ese lado ya se
 * arregló (`is_demo` excluido), y el resultado pasó a ser un «0 %» honesto pero mentiroso de otra
 * forma: un cero se lee como «tus alumnos no entrenan» cuando lo que pasa es que no hay alumnos.
 *
 * Lo que este test pinnea:
 *  - sin alumnos reales el stat vale «—», SIN sparkline y SIN delta (una tendencia sobre cero
 *    alumnos sería inventada);
 *  - con alumnos vuelve el porcentaje real, su sparkline y el permiso para pintar el delta —
 *    incluido el 0 % VERDADERO de un coach con alumnos que no entrenaron, que sí debe verse;
 *  - la sparkline queda clampeada a 0-100 en los dos extremos (el wiggle no puede sacar la curva
 *    del viewBox ni en 0 % ni en 100 %).
 *
 * GOTCHA de resolución (mismo patrón que `tests/mobile/coach-dashboard-deltas.test.ts`): los ids
 * bare resuelven distinto desde `tests/` que desde `apps/mobile/`, así que las dependencias del
 * módulo se mockean por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Mod = typeof import('../apps/mobile/lib/coach-dashboard')

async function loadModule(): Promise<Mod> {
  vi.resetModules()
  vi.doMock(mobileDep('@sentry/react-native'), () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }))
  vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: {} }))
  vi.doMock(mobileLib('coach.ts'), () => ({ getCoachProfile: vi.fn() }))
  vi.doMock(mobileLib('api.ts'), () => ({ apiFetch: vi.fn(), getApiBaseUrl: () => 'https://www.eva-app.cl' }))
  vi.doMock(mobileLib('workspace.ts'), () => ({ getActiveCoachWorkspace: vi.fn() }))
  vi.doMock(mobileLib('branding.ts'), () => ({ loadStoredBranding: vi.fn(async () => null) }))
  return (await import(mobileLib('coach-dashboard.ts'))) as Mod
}

describe('adherenceHeroStat', () => {
  let adherenceHeroStat: Mod['adherenceHeroStat']

  beforeEach(async () => {
    adherenceHeroStat = (await loadModule()).adherenceHeroStat
  })

  it('sin alumnos reales muestra «—» pelado: ni sparkline ni delta', () => {
    expect(adherenceHeroStat({ avgAdherence: 0, totalClients: 0 })).toEqual({
      value: '—',
      spark: null,
      showDelta: false,
    })
    // Aunque el server mandara un porcentaje viejo, sin denominador no se pinta.
    expect(adherenceHeroStat({ avgAdherence: 78, totalClients: 0 })).toEqual({
      value: '—',
      spark: null,
      showDelta: false,
    })
  })

  it('con alumnos muestra el porcentaje real, su sparkline y habilita el delta', () => {
    const stat = adherenceHeroStat({ avgAdherence: 71, totalClients: 4 })
    expect(stat.value).toBe('71%')
    expect(stat.showDelta).toBe(true)
    expect(stat.spark).toEqual([62, 66, 64, 69, 67, 72, 71])
  })

  it('un 0 % con alumnos SÍ se pinta: es un cero verdadero, no la ausencia de datos', () => {
    const stat = adherenceHeroStat({ avgAdherence: 0, totalClients: 3 })
    expect(stat.value).toBe('0%')
    expect(stat.showDelta).toBe(true)
    expect(stat.spark).not.toBeNull()
  })

  it('la sparkline queda clampeada a 0-100 en los dos extremos', () => {
    const bajo = adherenceHeroStat({ avgAdherence: 0, totalClients: 3 }).spark ?? []
    const alto = adherenceHeroStat({ avgAdherence: 100, totalClients: 3 }).spark ?? []
    expect(bajo).toEqual([0, 0, 0, 0, 0, 1, 0])
    expect(alto).toEqual([91, 95, 93, 98, 96, 100, 100])
    for (const value of [...bajo, ...alto]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })
})
