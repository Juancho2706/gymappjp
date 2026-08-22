import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ONBOARDING_STEPS, ONBOARDING_TOTAL_STEPS, type OnboardingSignals } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'

/**
 * «Tus primeros pasos» (`/coach/guia`) — la guía en su casa nueva (decisión del owner 22-08).
 *
 * El estado de la guía sigue siendo el de siempre (`useOnboardingGuide`), así que acá se lo
 * inyecta ya resuelto: lo que se prueba es QUÉ pinta la pantalla en cada estado, no el hook (que
 * tiene su propia suite en `dashboard/_lib/use-onboarding-guide.test.ts`).
 */

const { vmRef, persistMock, deleteDemoMock, telemetryMock } = vi.hoisted(() => ({
    vmRef: { current: null as unknown },
    persistMock: vi.fn().mockResolvedValue({ ok: true }),
    deleteDemoMock: vi.fn().mockResolvedValue({ ok: true }),
    telemetryMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))
vi.mock('../../dashboard/_lib/use-onboarding-guide', () => ({
    useOnboardingGuide: () => vmRef.current,
}))
vi.mock('../../dashboard/_lib/onboarding-telemetry.client', () => ({
    postGuideEngagement: telemetryMock,
}))
vi.mock('../../dashboard/_actions/onboarding-guide.actions', () => ({
    persistOnboardingGuideAction: persistMock,
}))
vi.mock('../../dashboard/_actions/demo-student.actions', () => ({
    deleteDemoStudentAction: deleteDemoMock,
}))
vi.mock('../../dashboard/_actions/vive-tu-app.actions', () => ({ openViveTuAppAction: vi.fn() }))
vi.mock('../../settings/_actions/settings.actions', () => ({
    updateBrandSettingsAction: vi.fn(),
    createLogoUploadUrlAction: vi.fn(),
}))

import { GuideScreen, type GuideScreenProps } from './GuideScreen'
import type { OnboardingGuideVm } from '../../dashboard/_lib/use-onboarding-guide'
import type { CoachBrandDraft, DemoStudentSnapshot } from '../../dashboard/_data/dashboard.queries'

const BRAND: CoachBrandDraft = {
    fullName: 'Juan Pérez',
    brandName: 'JP Coaching',
    instagramHandle: '',
    primaryColor: '#10B981',
    useBrandColorsCoach: true,
    welcomeMessage: '',
    loaderText: '',
    useCustomLoader: false,
    loaderIconMode: 'eva',
    neutralTint: false,
    brandFontKey: '',
    loaderVariant: 'eva',
    welcomeModalEnabled: false,
    welcomeModalContent: '',
    welcomeModalType: 'text',
    executorTheme: 'coach',
    themePresetKey: '',
    loginLayoutKey: '',
    loaderConfig: '',
    logoUrl: null,
}

const DEMO: DemoStudentSnapshot = {
    clientId: 'demo-1',
    fullName: 'Ana Riquelme',
    kpis: [
        { label: 'Pauta', value: 'Activa' },
        { label: 'Comidas', value: null },
        { label: 'Grasa', value: '27%' },
    ],
}

const SIGNALS: OnboardingSignals = {
    hasBrand: false,
    viveTuAppOpened: false,
    hasFirstArtifact: false,
    realClients: 0,
    realStudentActivity: false,
}

function makeVm(over: Partial<OnboardingGuideVm> = {}): OnboardingGuideVm {
    const persona: Persona = over.persona ?? 'nutrition'
    return {
        ready: true,
        persona,
        steps: ONBOARDING_STEPS[persona],
        completed: {
            profile_branding: false,
            vive_tu_app: false,
            first_artifact: false,
            first_client: false,
            aha: false,
        },
        done: 0,
        total: ONBOARDING_TOTAL_STEPS,
        allDone: false,
        atFoot: false,
        hidden: false,
        markStepCompleted: vi.fn(),
        sendToFoot: vi.fn(),
        hide: vi.fn(),
        ...over,
    }
}

function renderScreen(props: Partial<GuideScreenProps> = {}, vm: Partial<OnboardingGuideVm> = {}) {
    vmRef.current = makeVm(vm)
    return render(
        <GuideScreen
            coachId="coach-1"
            firstName="Ana"
            persona="nutrition"
            demo={null}
            brand={BRAND}
            needsBrand={false}
            showsEvaBadge
            signals={SIGNALS}
            initialGuide={{}}
            guideSeenAt="2026-08-22T10:00:00.000Z"
            welcome={false}
            {...props}
        />
    )
}

beforeEach(() => {
    persistMock.mockClear()
    deleteDemoMock.mockClear()
    telemetryMock.mockClear()
})

describe('GuideScreen', () => {
    it('pinta la cabecera con el nombre y los 5 pasos de la PERSONA', () => {
        renderScreen()
        expect(screen.getByRole('heading', { level: 1, name: /Tus primeros pasos, Ana/ })).toBeTruthy()
        expect(screen.getByText('Arma la pauta de Ana desde una plantilla')).toBeTruthy()
        expect(screen.queryByText(/rutina de Matías/)).toBeNull()
        expect(screen.getAllByRole('listitem')).toHaveLength(5)
    })

    it('el anillo anuncia el progreso y el chip lleva a Mi panel', () => {
        renderScreen({}, { done: 3 })
        expect(screen.getByRole('img', { name: 'Progreso de la guía: 3 de 5' })).toBeTruthy()
        const chip = screen.getByRole('link', { name: /Nutrición/ })
        expect(chip.getAttribute('href')).toBe('/coach/settings/funciones')
    })

    it('sin persona ofrece elegir especialidad y no pinta chip', () => {
        renderScreen({ persona: null }, { persona: 'other' })
        expect(screen.getByText('Elige tu especialidad y ordenamos tu panel')).toBeTruthy()
        expect(screen.queryByRole('link', { name: /Cambiar en Mi panel/ })).toBeNull()
    })

    it('«?bienvenida=1» pinta la banda de dos líneas, sin modal', () => {
        renderScreen({ welcome: true })
        const band = screen.getByLabelText('Bienvenida')
        expect(band.textContent).toContain('Te damos la bienvenida, Ana.')
        expect(band.textContent).toContain('paciente de ejemplo')
    })

    it('sin «?bienvenida=1» no hay banda', () => {
        renderScreen()
        expect(screen.queryByLabelText('Bienvenida')).toBeNull()
    })

    it('la tarjeta de marca solo aparece mientras el coach no tenga marca', () => {
        renderScreen({ needsBrand: true })
        expect(screen.getByText('Tu marca en 60 segundos')).toBeTruthy()
    })

    it('sin `needsBrand` la tarjeta de marca no se pinta', () => {
        renderScreen()
        expect(screen.queryByText('Tu marca en 60 segundos')).toBeNull()
    })

    it('el alumno de ejemplo viaja en su propio riel, etiquetado y sin ocupar cupo', () => {
        renderScreen({ demo: DEMO })
        expect(screen.getByText(/Paciente de ejemplo · no ocupa tu cupo/)).toBeTruthy()
    })

    it('mientras hidrata muestra esqueleto en vez de un 0/5 que después salta', () => {
        const { container } = renderScreen({}, { ready: false })
        expect(container.querySelector('.animate-pulse')).toBeTruthy()
        expect(screen.queryByRole('listitem')).toBeNull()
    })

    it('con 5/5 pinta el cierre con «Ir a mi panel» y «Borrar ejemplo»', () => {
        renderScreen({ demo: DEMO }, { done: 5, allDone: true, atFoot: true })
        const closing = screen.getByLabelText('Guía completada')
        expect(closing.textContent).toContain('Listo: los cinco pasos están hechos')
        expect(screen.getAllByText('Borrar ejemplo').length).toBeGreaterThan(0)
    })

    it('la guía NO desaparece por estar «al pie»: acá es la pantalla entera', () => {
        // En el dashboard `atFoot` la mandaba a una tira de una línea; en su casa nueva se sigue
        // pintando completa (si no, el coach que la descartó entraría a una pantalla vacía).
        renderScreen({}, { atFoot: true, done: 2 })
        expect(screen.getAllByRole('listitem')).toHaveLength(5)
    })
})

describe('sello de la primera visita', () => {
    it('estampa `guide_seen_at` al montar, sin esperar (si no, «Ir a mi panel» rebotaría acá)', async () => {
        renderScreen({ guideSeenAt: null })
        await waitFor(() => {
            expect(persistMock).toHaveBeenCalledTimes(1)
        })
        const payload = persistMock.mock.calls[0][0] as { guide_seen_at?: string }
        expect(typeof payload.guide_seen_at).toBe('string')
        expect(Number.isNaN(Date.parse(payload.guide_seen_at ?? ''))).toBe(false)
    })

    it('si ya estaba estampado no vuelve a escribir', async () => {
        renderScreen({ guideSeenAt: '2026-08-22T10:00:00.000Z' })
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(persistMock).not.toHaveBeenCalled()
    })
})
