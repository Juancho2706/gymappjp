/**
 * Modo de onboarding del panel coach en la app (`apps/mobile/lib/onboarding-mode.tsx`,
 * W4.7-rn de coach-onboarding-v2).
 *
 * Lo que se pinnea es la decisión del owner (2026-08-22): «no podemos tener varios onboardings en
 * una sola área». Mientras la guía v2 está activa, `guideActive` es true y NINGÚN tour de módulo
 * puede auto-arrancar; con la guía completa, descartada, oculta o en un workspace administrado el
 * panel vuelve a comportarse como siempre.
 *
 * GOTCHA de resolución (mismo patrón que `coach-persona.test.ts` / `onboarding-v2-parser.test.ts`):
 * los módulos de `apps/mobile` arrastran react-native, que resuelve distinto desde `tests/` que
 * desde `apps/mobile/`. Se mockean por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico, así el
 * módulo bajo prueba solo carga React y `@eva/onboarding` (puro).
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)

type Module = typeof import('../../apps/mobile/lib/onboarding-mode')
type Guide = { completed: Record<string, boolean>; dismissed: boolean; hidden: boolean }

/** Foto del onboarding tal como la publica el dashboard, recortada a lo que mira el modo. */
function snapshotWith(guide: Partial<Guide>) {
    return {
        coachId: 'coach-1',
        onboardingV2: {
            persona: 'strength',
            alsoOther: false,
            needsPersona: false,
            demoClientId: null,
            demoName: null,
            guide: {
                completed: guide.completed ?? {},
                dismissed: guide.dismissed ?? false,
                hidden: guide.hidden ?? false,
                guideSeenAt: null,
            },
            signals: {
                hasBrand: false,
                viveTuAppOpened: false,
                hasFirstArtifact: false,
                realClients: 0,
                realStudentActivity: false,
            },
        },
    }
}

const ALL_FIVE = {
    profile_branding: true,
    vive_tu_app: true,
    first_artifact: true,
    first_client: true,
    aha: true,
}

let snapshot: ReturnType<typeof snapshotWith> | null = null
let workspace = { kind: 'standalone', isManaged: false }

async function loadModule(): Promise<Module> {
    vi.resetModules()
    vi.doMock(mobileLib('coach-dashboard'), () => ({ useCoachOnboarding: () => snapshot }))
    vi.doMock(mobileLib('workspace'), () => ({ useWorkspace: () => workspace }))
    return (await import(mobileLib('onboarding-mode'))) as Module
}

beforeEach(() => {
    snapshot = null
    workspace = { kind: 'standalone', isManaged: false }
})

describe('resolveOnboardingMode', () => {
    it('guía recién empezada en un coach standalone: el modo guía manda', async () => {
        const { resolveOnboardingMode } = await loadModule()
        const mode = resolveOnboardingMode({
            onboardingV2: snapshotWith({}).onboardingV2 as never,
            managed: false,
        })
        expect(mode.guideActive).toBe(true)
    })

    it('la apaga la guía completa (5/5 persistido), la descartada y la oculta', async () => {
        const { resolveOnboardingMode } = await loadModule()
        const cases: Array<Partial<Guide>> = [
            { completed: ALL_FIVE },
            { dismissed: true },
            { hidden: true },
        ]
        for (const guide of cases) {
            const mode = resolveOnboardingMode({
                onboardingV2: snapshotWith(guide).onboardingV2 as never,
                managed: false,
            })
            expect(mode.guideActive).toBe(false)
        }
    })

    it('un coach administrado (org/team) nunca tiene guía propia', async () => {
        const { resolveOnboardingMode } = await loadModule()
        const mode = resolveOnboardingMode({
            onboardingV2: snapshotWith({}).onboardingV2 as never,
            managed: true,
        })
        expect(mode.guideActive).toBe(false)
    })

    it('sin foto del panel degrada a "nada gateado" (no apaga los tours para siempre)', async () => {
        const { resolveOnboardingMode } = await loadModule()
        expect(resolveOnboardingMode({ onboardingV2: null, managed: false }).guideActive).toBe(false)
    })
})

describe('tourAutoStartEligible', () => {
    it('solo auto-arranca cuando la superficie lo pide Y la guía no está activa', async () => {
        const { tourAutoStartEligible } = await loadModule()
        expect(tourAutoStartEligible({ autoStart: true, guideActive: false })).toBe(true)
        expect(tourAutoStartEligible({ autoStart: true, guideActive: true })).toBe(false)
        expect(tourAutoStartEligible({ autoStart: false, guideActive: false })).toBe(false)
        expect(tourAutoStartEligible({ autoStart: false, guideActive: true })).toBe(false)
    })
})

describe('OnboardingModeProvider', () => {
    it('publica el modo que sale de la foto del dashboard', async () => {
        const { OnboardingModeProvider, useOnboardingMode } = await loadModule()
        snapshot = snapshotWith({})
        const { result } = renderHook(() => useOnboardingMode(), { wrapper: OnboardingModeProvider })
        expect(result.current.guideActive).toBe(true)
    })

    it('workspace de team: el panel no es suyo, el modo guía no manda', async () => {
        const { OnboardingModeProvider, useOnboardingMode } = await loadModule()
        snapshot = snapshotWith({})
        workspace = { kind: 'team_member', isManaged: true }
        const { result } = renderHook(() => useOnboardingMode(), { wrapper: OnboardingModeProvider })
        expect(result.current.guideActive).toBe(false)
    })

    it('sin provider el hook devuelve el default: la app se comporta como siempre', async () => {
        const { useOnboardingMode } = await loadModule()
        snapshot = snapshotWith({})
        const { result } = renderHook(() => useOnboardingMode())
        expect(result.current.guideActive).toBe(false)
    })
})
