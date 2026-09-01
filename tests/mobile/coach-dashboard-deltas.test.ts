/**
 * Deltas reales de los KPI del hero móvil (`mapKpiDeltas` de `apps/mobile/lib/coach-dashboard`).
 *
 * Tarea 7C.4: el hero RN dejó de pintar deltas hardcodeados (+1 / 0 / +3) y consume `kpi.deltas`
 * del endpoint. La app viaja por binario Y por OTA, así que un teléfono nuevo puede pegarle a un
 * deploy VIEJO que todavía no sirve `deltas` —o a uno que los sirve a medias— y eso NO puede
 * romper el dashboard ni, peor, hacer que RN pinte un delta inventado: lo que no valida ⇒ `null`.
 *
 * GOTCHA de resolución (mismo patrón que `coach-dashboard-logo.test.ts`): los ids bare resuelven
 * distinto desde `tests/` que desde `apps/mobile/`, así que las dependencias del módulo se
 * mockean por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Mod = typeof import('../../apps/mobile/lib/coach-dashboard')

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

/** Payload tal cual lo sirve `/api/mobile/coach/dashboard` (contrato `KpiDeltas` web). */
const SERVER_DELTAS = {
  clients: { value: 2, text: '+2 vs. ayer', tone: 'positive' },
  risk: null,
  adherence: { value: -2, text: '−2 pts vs. semana previa', tone: 'negative' },
  sessionsToday: { value: 0, text: 'igual que ayer', tone: 'neutral' },
}

describe('mapKpiDeltas', () => {
  let mapKpiDeltas: Mod['mapKpiDeltas']

  beforeEach(async () => {
    mapKpiDeltas = (await loadModule()).mapKpiDeltas
  })

  it('mapea tal cual los deltas válidos del server (RN no redacta copy ni recalcula el tono)', () => {
    expect(mapKpiDeltas(SERVER_DELTAS)).toEqual({
      clients: { value: 2, text: '+2 vs. ayer', tone: 'positive' },
      risk: null,
      adherence: { value: -2, text: '−2 pts vs. semana previa', tone: 'negative' },
      sessionsToday: { value: 0, text: 'igual que ayer', tone: 'neutral' },
    })
  })

  it('deploy viejo del backend (sin `deltas`) ⇒ los cuatro en null, no explota', () => {
    const empty = { clients: null, risk: null, adherence: null, sessionsToday: null }
    expect(mapKpiDeltas(undefined)).toEqual(empty)
    expect(mapKpiDeltas(null)).toEqual(empty)
    // Tipo inesperado en el JSON (string, número, arreglo) tampoco puede tumbar el dashboard.
    expect(mapKpiDeltas('nope')).toEqual(empty)
    expect(mapKpiDeltas(7)).toEqual(empty)
  })

  it('una entrada malformada cae a null y NO arrastra a las otras', () => {
    const mapped = mapKpiDeltas({
      ...SERVER_DELTAS,
      // Sin `text`: no hay nada honesto que pintar.
      clients: { value: 2, tone: 'positive' },
    })
    expect(mapped.clients).toBeNull()
    expect(mapped.adherence).toEqual({ value: -2, text: '−2 pts vs. semana previa', tone: 'negative' })
    expect(mapped.sessionsToday).toEqual({ value: 0, text: 'igual que ayer', tone: 'neutral' })
  })

  it('descarta las formas rotas de a una: value no numérico, texto vacío, tono desconocido', () => {
    const mapped = mapKpiDeltas({
      clients: { value: '2', text: '+2 vs. ayer', tone: 'positive' },
      risk: { value: 1, text: '   ', tone: 'negative' },
      adherence: { value: 3, text: '+3 pts', tone: 'buenisimo' },
      sessionsToday: { value: Number.NaN, text: 'igual que ayer', tone: 'neutral' },
    })
    expect(mapped).toEqual({ clients: null, risk: null, adherence: null, sessionsToday: null })
  })
})
