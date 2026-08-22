/**
 * Parser del bloque `onboardingV2` que el endpoint `/api/mobile/coach/dashboard` sirve para la
 * guía de RN (`apps/mobile/lib/coach-dashboard.ts`, TASKS coach-onboarding-v2 W5 F5.2).
 *
 * Lo que se prueba es la TOLERANCIA, que es la razón de que este parser exista: la app se
 * distribuye por binario y por OTA, así que un teléfono nuevo puede pegarle a un deploy viejo (sin
 * `onboardingV2`) y un teléfono viejo a uno nuevo. Si el parser fuera todo-o-nada, la pantalla se
 * caería entera en vez de degradar.
 *
 * GOTCHA de resolución (mismo patrón que `coach-access.test.ts`): los ids bare (`react-native`,
 * `@sentry/react-native`, …) resuelven distinto desde `tests/` que desde `apps/mobile/` en este
 * monorepo pnpm, así que las dependencias del módulo se mockean por PATH ABSOLUTO tal como las ve
 * `apps/mobile` (`createRequire` con `paths: [mobileDir]`) con `vi.doMock` + `import()` dinámico.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Parser = typeof import('../../apps/mobile/lib/coach-dashboard')

async function loadModule(): Promise<Parser> {
    vi.resetModules()
    vi.doMock(mobileDep('@sentry/react-native'), () => ({ addBreadcrumb: vi.fn(), captureException: vi.fn() }))
    vi.doMock(mobileLib('supabase.ts'), () => ({ supabase: {} }))
    vi.doMock(mobileLib('coach.ts'), () => ({ getCoachProfile: vi.fn() }))
    // `branding.ts` entra por el respaldo de logo del coach (`parseMobileDashboardCoach`) y arrastra
    // AsyncStorage, que no resuelve fuera de Metro.
    vi.doMock(mobileLib('branding.ts'), () => ({ loadStoredBranding: vi.fn(async () => null) }))
    vi.doMock(mobileLib('api.ts'), () => ({ apiFetch: vi.fn(), getApiBaseUrl: () => 'https://www.eva-app.cl' }))
    vi.doMock(mobileLib('workspace.ts'), () => ({ getActiveCoachWorkspace: vi.fn() }))
    return (await import(mobileLib('coach-dashboard.ts'))) as Parser
}

/** Payload completo, tal como lo arma hoy `api/mobile/coach/dashboard/route.ts`. */
const FULL = {
    persona: 'nutrition',
    alsoOther: true,
    needsPersona: false,
    demoClientId: '7d5b2f8e-0000-4000-8000-000000000001',
    demoName: 'Ana Pérez',
    signals: {
        hasBrand: true,
        viveTuAppOpened: false,
        hasFirstArtifact: true,
        realClients: 3,
        realStudentActivity: false,
    },
    guide: {
        completed: { profile_branding: true, first_artifact: true },
        dismissed: false,
        hidden: false,
        guideSeenAt: '2026-08-22T10:00:00.000Z',
    },
}

describe('parseMobileOnboardingV2', () => {
    beforeEach(() => vi.clearAllMocks())

    it('lee el contrato completo del endpoint', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        expect(parseMobileOnboardingV2(FULL)).toEqual({
            persona: 'nutrition',
            alsoOther: true,
            needsPersona: false,
            demoClientId: '7d5b2f8e-0000-4000-8000-000000000001',
            demoName: 'Ana Pérez',
            guide: {
                completed: { profile_branding: true, first_artifact: true },
                dismissed: false,
                hidden: false,
                guideSeenAt: '2026-08-22T10:00:00.000Z',
            },
            signals: FULL.signals,
        })
    })

    it('sin `onboardingV2` (deploy viejo) degrada sin romperse: 5 pasos pendientes y persona nula', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        const parsed = parseMobileOnboardingV2(undefined)
        expect(parsed.persona).toBeNull()
        expect(parsed.needsPersona).toBe(false)
        expect(parsed.demoClientId).toBeNull()
        expect(parsed.guide.completed).toEqual({})
        expect(parsed.signals).toEqual({
            hasBrand: false,
            viveTuAppOpened: false,
            hasFirstArtifact: false,
            realClients: 0,
            realStudentActivity: false,
        })
    })

    it('sin bloque `guide`, el progreso sale del jsonb crudo que el endpoint ya servía', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        const parsed = parseMobileOnboardingV2(
            { persona: 'strength', signals: { hasBrand: true } },
            { completed: { profile_branding: true }, dismissed: true, guide_seen_at: '2026-08-01T00:00:00.000Z' },
        )
        expect(parsed.persona).toBe('strength')
        expect(parsed.guide.completed).toEqual({ profile_branding: true })
        expect(parsed.guide.dismissed).toBe(true)
        // El jsonb crudo trae la clave en snake_case; el bloque del endpoint, en camelCase.
        expect(parsed.guide.guideSeenAt).toBe('2026-08-01T00:00:00.000Z')
    })

    it('una persona fuera del CHECK no se cuela: cae a `null` en vez de romper el lookup de pasos', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        expect(parseMobileOnboardingV2({ persona: 'kinesiologo' }).persona).toBeNull()
        expect(parseMobileOnboardingV2({ persona: 42 }).persona).toBeNull()
    })

    it('las claves de la guía v1 no ensucian el progreso de la v2', async () => {
        const { parseMobileOnboardingGuide } = await loadModule()
        const parsed = parseMobileOnboardingGuide({
            completed: { first_plan: true, first_checkin: true, profile_branding: true },
        })
        expect(parsed.completed).toEqual({ profile_branding: true })
    })

    it('solo `true` cuenta como tildado: un string no completa un paso', async () => {
        const { parseMobileOnboardingGuide } = await loadModule()
        const parsed = parseMobileOnboardingGuide({ completed: { profile_branding: 'si', aha: true } })
        expect(parsed.completed).toEqual({ aha: true })
    })

    it('acepta el demo anidado (forma de la web) además del plano', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        const parsed = parseMobileOnboardingV2({
            demo: { clientId: 'abc', fullName: 'Matías' },
        })
        expect(parsed.demoClientId).toBe('abc')
        expect(parsed.demoName).toBe('Matías')
    })

    it('un `realClients` no numérico degrada a 0 (nunca a NaN, que rompería el conteo)', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        expect(parseMobileOnboardingV2({ signals: { realClients: 'muchos' } }).signals.realClients).toBe(0)
        expect(parseMobileOnboardingV2({ signals: { realClients: Number.NaN } }).signals.realClients).toBe(0)
    })

    it('un payload hostil (array, string, null) devuelve el estado vacío', async () => {
        const { parseMobileOnboardingV2 } = await loadModule()
        for (const raw of [null, 'x', 42, [], [{ persona: 'strength' }]]) {
            const parsed = parseMobileOnboardingV2(raw)
            expect(parsed.persona).toBeNull()
            expect(parsed.guide.dismissed).toBe(false)
        }
    })
})

describe('store del onboarding (la píldora lee lo que publica el panel)', () => {
    it('arranca vacío, entrega la última foto publicada y se limpia al cambiar de cuenta', async () => {
        const {
            parseMobileOnboardingV2,
            publishCoachOnboarding,
            clearCoachOnboarding,
            getCoachOnboardingSnapshot,
        } = await loadModule()

        // Sin foto publicada la píldora no se pinta: es el estado de un arranque en frío.
        expect(getCoachOnboardingSnapshot()).toBeNull()

        publishCoachOnboarding({ coachId: 'coach-1', onboardingV2: parseMobileOnboardingV2(FULL) })
        expect(getCoachOnboardingSnapshot()?.coachId).toBe('coach-1')
        expect(getCoachOnboardingSnapshot()?.onboardingV2.persona).toBe('nutrition')

        publishCoachOnboarding({ coachId: 'coach-2', onboardingV2: parseMobileOnboardingV2(null) })
        expect(getCoachOnboardingSnapshot()?.coachId).toBe('coach-2')

        // Cambio de cuenta: la guía del coach anterior no puede sobrevivir.
        clearCoachOnboarding()
        expect(getCoachOnboardingSnapshot()).toBeNull()
    })
})
