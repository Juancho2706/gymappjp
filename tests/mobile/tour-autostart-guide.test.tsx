/**
 * Auto-arranque de la Guía Viva de Nutrición en la app, gateado por la guía v2 del coach
 * (`useTourController` en `apps/mobile/components/nutrition-v2/tour/TourOverlay.tsx`, W4.7-rn).
 *
 * Decisión del owner (2026-08-22): «no podemos tener varios onboardings en una sola área».
 * Mientras la guía v2 está activa, el tour del hub y el del editor NO se disparan solos — pero el
 * «?» los sigue abriendo, y ese camino manual no puede marcar el tour como visto (si lo marcara, el
 * coach perdería el auto-arranque para cuando la guía termine).
 *
 * GOTCHA de resolución (igual que `coach-access.test.ts`): los ids bare resuelven distinto desde
 * `tests/` que desde `apps/mobile/`, así que todo el grafo del módulo se mockea por PATH ABSOLUTO
 * con `vi.doMock` + `import()` dinámico. Solo se ejercita el HOOK: el overlay no se pinta.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const tourFile = (name: string) =>
    path.resolve(mobileDir, 'components', 'nutrition-v2', 'tour', name)

type Module = typeof import('../../apps/mobile/components/nutrition-v2/tour/TourOverlay')

const noop = () => null

/** Las dos caras de `lucide-react-native` (CJS y ESM), normalizadas a barras posix. */
function lucideIds(): string[] {
    const cjs = mobileDep('lucide-react-native').split('\\').join('/')
    return [cjs, cjs.replace('/dist/cjs/lucide-react-native.js', '/dist/esm/lucide-react-native.mjs')]
}

let guideActive = false
let seen = false
let markCalls: Array<[string, string | null | undefined]> = []
let seenCalls: Array<[string, string | null | undefined]> = []

async function loadModule(): Promise<Module> {
    vi.resetModules()
    vi.doMock(mobileDep('react-native'), () => ({
        BackHandler: { addEventListener: () => ({ remove: () => {} }) },
        Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
        Pressable: noop,
        ScrollView: noop,
        StatusBar: { currentHeight: 0 },
        Text: noop,
        View: noop,
    }))
    vi.doMock(mobileDep('react-native-safe-area-context'), () => ({
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    }))
    vi.doMock(mobileDep('expo-image'), () => ({ Image: noop }))
    vi.doMock(mobileDep('moti'), () => ({ MotiView: noop }))
    // lucide expone dos entradas (CJS por `require`, ESM por `import`): `require.resolve` da la
    // primera y vite carga la segunda, así que se mockean las dos o el módulo real se cuela.
    for (const id of lucideIds()) {
        vi.doMock(id, () => ({ ChevronLeft: noop, ChevronRight: noop }))
    }
    vi.doMock(path.resolve(mobileDir, 'context', 'ThemeContext'), () => ({
        useTheme: () => ({ theme: {} }),
    }))
    vi.doMock(mobileLib('motion'), () => ({ EASE: [0, 0, 1, 1], useEvaMotion: () => ({ reduced: false }) }))
    vi.doMock(tourFile('tour-flags'), () => ({
        hasSeenTour: (tourId: string, coachId: string | null | undefined) => {
            seenCalls.push([tourId, coachId])
            return Promise.resolve(seen)
        },
        markTourSeen: (tourId: string, coachId: string | null | undefined) => {
            markCalls.push([tourId, coachId])
            return Promise.resolve()
        },
    }))
    vi.doMock(tourFile('tour-geometry'), () => ({ computeTourHole: () => null, panesFor: () => [] }))
    vi.doMock(tourFile('TourTargets'), () => ({ useTourTargets: () => ({ get: () => null }) }))
    vi.doMock(tourFile('tours'), () => ({ tourIconSource: () => null }))
    vi.doMock(mobileLib('onboarding-mode'), () => ({
        useOnboardingMode: () => ({ guideActive }),
        tourAutoStartEligible: (input: { autoStart: boolean; guideActive: boolean }) =>
            input.autoStart === true && input.guideActive !== true,
    }))
    return (await import(tourFile('TourOverlay'))) as Module
}

beforeEach(() => {
    guideActive = false
    seen = false
    markCalls = []
    seenCalls = []
})

describe('useTourController — auto-arranque con la guía v2 activa', () => {
    it('con la guía activa NO auto-arranca ni pregunta por el flag', async () => {
        guideActive = true
        const { useTourController } = await loadModule()
        const { result } = renderHook(() =>
            useTourController({ tourId: 'hub', coachId: 'coach-1', autoStart: true }),
        )
        await act(async () => {})
        expect(result.current.active).toBe(false)
        // Ni siquiera se consulta la memoria: no hay auto-arranque que decidir.
        expect(seenCalls).toEqual([])
        // Y nada quedó marcado como visto: el auto-arranque sigue disponible después de la guía.
        expect(markCalls).toEqual([])
    })

    it('con la guía activa el «?» sigue abriendo el tour, y abrirlo no lo marca visto', async () => {
        guideActive = true
        const { useTourController } = await loadModule()
        const { result } = renderHook(() =>
            useTourController({ tourId: 'editor', coachId: 'coach-1', autoStart: true }),
        )
        await act(async () => {
            result.current.start()
        })
        expect(result.current.active).toBe(true)
        expect(markCalls).toEqual([])
        // Recién al cerrarlo se marca (D4: «Listo» y «Saltar» marcan igual).
        await act(async () => {
            result.current.end('done')
        })
        expect(result.current.active).toBe(false)
        expect(markCalls).toEqual([['editor', 'coach-1']])
    })

    it('sin guía activa el auto-arranque de siempre sigue intacto', async () => {
        guideActive = false
        const { useTourController } = await loadModule()
        const { result } = renderHook(() =>
            useTourController({ tourId: 'hub', coachId: 'coach-1', autoStart: true }),
        )
        await act(async () => {})
        expect(seenCalls).toEqual([['hub', 'coach-1']])
        expect(result.current.active).toBe(true)
    })

    it('sin guía activa pero con el tour ya visto tampoco arranca (memoria D4)', async () => {
        seen = true
        const { useTourController } = await loadModule()
        const { result } = renderHook(() =>
            useTourController({ tourId: 'hub', coachId: 'coach-1', autoStart: true }),
        )
        await act(async () => {})
        expect(result.current.active).toBe(false)
    })

    it('la superficie que no pide auto-arranque sigue sin arrancar', async () => {
        const { useTourController } = await loadModule()
        const { result } = renderHook(() =>
            useTourController({ tourId: 'editor', coachId: 'coach-1', autoStart: false }),
        )
        await act(async () => {})
        expect(result.current.active).toBe(false)
        expect(seenCalls).toEqual([])
    })
})
