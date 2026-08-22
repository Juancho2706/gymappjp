/**
 * Logo de marca del coach en el dashboard móvil (`parseMobileDashboardCoach`).
 *
 * QA del owner 22-08: el avatar del saludo salía SIEMPRE con la figura EVA aunque el coach
 * tuviera logo, porque `/api/mobile/coach/dashboard` servía solo `hasCoachLogo` (booleano) y
 * `logoUrl` llegaba `undefined` en el camino feliz. El endpoint ya está agregando los dos
 * campos, así que el parser tiene que aceptarlos —en camelCase y en snake_case, porque la app
 * viaja por binario y por OTA y un teléfono puede pegarle a cualquiera de los dos deploys— y
 * caer a la caché de marca cuando no vienen.
 *
 * GOTCHA de resolución (mismo patrón que `onboarding-v2-parser.test.ts`): los ids bare resuelven
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

/** Lo mínimo que el resto del dashboard necesita del coach (banners de plan y cupo). */
const BASE = {
  id: 'c-1',
  fullName: 'Ana Pérez',
  brandName: 'Studio Fuerza',
  slug: 'studio-fuerza',
  inviteCode: 'SFZ',
  primaryColor: '#E11D74',
  subscriptionStatus: 'active',
  subscriptionTier: 'pro',
  currentPeriodEnd: null,
  trialEndsAt: null,
  maxClients: 25,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('parseMobileDashboardCoach', () => {
  let parse: Mod['parseMobileDashboardCoach']

  beforeEach(async () => {
    parse = (await loadModule()).parseMobileDashboardCoach
  })

  it('conserva todo el perfil y no inventa logo cuando no hay ninguno', () => {
    const coach = parse(BASE)
    expect(coach.brandName).toBe('Studio Fuerza')
    expect(coach.maxClients).toBe(25)
    expect(coach.logoUrl).toBeNull()
    expect(coach.logoUrlDark).toBeNull()
    expect(coach.hasCoachLogo).toBe(false)
  })

  it('lee los logos en camelCase', () => {
    const coach = parse({ ...BASE, logoUrl: 'https://cdn/eva/logo.png', logoUrlDark: 'https://cdn/eva/dark.png' })
    expect(coach.logoUrl).toBe('https://cdn/eva/logo.png')
    expect(coach.logoUrlDark).toBe('https://cdn/eva/dark.png')
    expect(coach.hasCoachLogo).toBe(true)
  })

  it('lee los logos en snake_case (deploy que sirve la fila cruda)', () => {
    const coach = parse({ ...BASE, logo_url: 'https://cdn/eva/logo.png', logo_url_dark: 'https://cdn/eva/dark.png' })
    expect(coach.logoUrl).toBe('https://cdn/eva/logo.png')
    expect(coach.logoUrlDark).toBe('https://cdn/eva/dark.png')
  })

  it('cae a la caché de marca cuando el endpoint todavía no sirve los logos', () => {
    const coach = parse(BASE, { logoUrl: 'https://cdn/cache/logo.png', logoUrlDark: 'https://cdn/cache/dark.png' })
    expect(coach.logoUrl).toBe('https://cdn/cache/logo.png')
    expect(coach.logoUrlDark).toBe('https://cdn/cache/dark.png')
    expect(coach.hasCoachLogo).toBe(true)
  })

  it('lo que sí vino del server GANA sobre la caché (la caché puede estar vieja)', () => {
    const coach = parse(
      { ...BASE, logoUrl: 'https://cdn/eva/nuevo.png' },
      { logoUrl: 'https://cdn/cache/viejo.png', logoUrlDark: 'https://cdn/cache/dark.png' },
    )
    expect(coach.logoUrl).toBe('https://cdn/eva/nuevo.png')
    // El oscuro no vino del server ⇒ sigue valiendo el de la caché.
    expect(coach.logoUrlDark).toBe('https://cdn/cache/dark.png')
  })

  it('una URL en blanco es "sin logo" (pintaría un avatar hueco en vez de caer al fallback)', () => {
    const coach = parse({ ...BASE, logoUrl: '   ', logoUrlDark: '' }, { logoUrl: null, logoUrlDark: null })
    expect(coach.logoUrl).toBeNull()
    expect(coach.logoUrlDark).toBeNull()
    expect(coach.hasCoachLogo).toBe(false)
  })

  it('solo logo oscuro sigue contando como "tiene logo"', () => {
    const coach = parse({ ...BASE, logoUrlDark: 'https://cdn/eva/dark.png' })
    expect(coach.hasCoachLogo).toBe(true)
    expect(coach.logoUrl).toBeNull()
  })

  it('respeta el `hasCoachLogo` del server: la señal NO va gateada aunque las URLs sí', () => {
    // Tier sin white-label: el endpoint manda la señal en true y las URLs en null.
    const coach = parse({ ...BASE, hasCoachLogo: true, logoUrl: null, logoUrlDark: null })
    expect(coach.hasCoachLogo).toBe(true)
    expect(coach.logoUrl).toBeNull()
  })
})
