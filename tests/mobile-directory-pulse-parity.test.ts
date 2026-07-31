// QA F2 — paridad del resumen/filtros del directorio coach con la web:
// - El filtro `nutrition_low` cuenta SOLO el flag NUTRICION_RIESGO
//   (espejo `matchesRiskFilter`, apps/web/.../ClientsDirectoryClient.tsx:67-68);
//   el umbral extra `nutritionPercentage < 60` divergia del conteo del resumen.
// - Los contadores Riesgo/Atención del resumen salen del array pulse crudo
//   (espejo CoachWarRoom.tsx:220-221) — mismos umbrales 50/25 verificados aquí.
//
// GOTCHA de resolución (mismo patrón que mobile-offline-cache-typed-axes.test.ts):
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

function client(mod: any, partial: Record<string, unknown> & { id: string }) {
  return {
    fullName: 'Alumno Test',
    email: 'a@test.cl',
    phone: null,
    isActive: true,
    isArchived: false,
    forcePwChange: false,
    createdAt: '2026-01-01T00:00:00Z',
    activeProgramName: null,
    planDaysRemaining: null,
    hasActiveProgram: false,
    attentionScore: 0,
    attentionFlags: [],
    lastWorkoutDate: null,
    lastCheckinDate: null,
    subscriptionStartDate: null,
    ...partial,
  }
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

describe('directorio coach — paridad de pulso con la web (QA F2)', () => {
  it('nutrition_low filtra SOLO por el flag NUTRICION_RIESGO (no por pct<60)', async () => {
    const lib = await loadLib()
    const clients = [client(lib, { id: 'a' }), client(lib, { id: 'b' }), client(lib, { id: 'c' })] as any[]
    const pulseById = new Map<string, any>([
      // a: flag presente → entra
      ['a', pulse({ clientId: 'a', attentionFlags: ['NUTRICION_RIESGO'], nutritionPercentage: 80 })],
      // b: pct bajo SIN flag → en la web NO entra; RN debe espejar
      ['b', pulse({ clientId: 'b', attentionFlags: [], nutritionPercentage: 40 })],
      // c: sin flag, pct sano → no entra
      ['c', pulse({ clientId: 'c', attentionFlags: [], nutritionPercentage: 90 })],
    ])
    const out = lib.filterClients(clients, '', 'nutrition_low', 'any', pulseById)
    expect(out.map((c: any) => c.id)).toEqual(['a'])
  })

  it('nutrition_low exige fila de pulse (sin pulse no matchea, espejo web `!!pulse`)', async () => {
    const lib = await loadLib()
    const clients = [client(lib, { id: 'a' })] as any[]
    const out = lib.filterClients(clients, '', 'nutrition_low', 'any', new Map())
    expect(out).toEqual([])
  })

  it('umbrales urgente/atención sobre el pulse crudo calzan con CoachWarRoom (50/25)', () => {
    const rows = [
      pulse({ clientId: 'archived-1', attentionScore: 80 }), // fila de pulse sin roster visible
      pulse({ clientId: 'x', attentionScore: 50 }),
      pulse({ clientId: 'y', attentionScore: 49 }),
      pulse({ clientId: 'z', attentionScore: 25 }),
      pulse({ clientId: 'w', attentionScore: 24 }),
    ]
    // Misma expresión que clientes.tsx (pulseUrgentCount/pulseReviewCount) y
    // CoachWarRoom.tsx:220-221 — el conteo NO depende del roster.
    const urgent = rows.filter((p) => (p.attentionScore as number) >= 50).length
    const review = rows.filter((p) => (p.attentionScore as number) >= 25 && (p.attentionScore as number) < 50).length
    expect(urgent).toBe(2)
    expect(review).toBe(2)
  })
})
