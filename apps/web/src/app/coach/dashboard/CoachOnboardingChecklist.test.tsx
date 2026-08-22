import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ONBOARDING_STEPS, ONBOARDING_TOTAL_STEPS } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'

// El árbol de la guía monta las tarjetas del día 1, que a su vez importan server actions. En el
// render solo interesa QUÉ se pinta y DÓNDE: las acciones se apagan.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
vi.mock('./_actions/vive-tu-app.actions', () => ({ openViveTuAppAction: vi.fn() }))
vi.mock('./_actions/demo-student.actions', () => ({ deleteDemoStudentAction: vi.fn() }))
vi.mock('../settings/_actions/settings.actions', () => ({
    updateBrandSettingsAction: vi.fn(),
    createLogoUploadUrlAction: vi.fn(),
}))

import {
    CoachOnboardingChecklist,
    OnboardingGuideFooterStrip,
    withPrimeraFlag,
} from './CoachOnboardingChecklist'
import type { OnboardingGuideVm } from './_lib/use-onboarding-guide'
import type { CoachBrandDraft, DemoStudentSnapshot } from './_data/dashboard.queries'

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

function renderTop(over: Partial<OnboardingGuideVm> = {}, props: Partial<Parameters<typeof CoachOnboardingChecklist>[0]> = {}) {
    return render(
        <CoachOnboardingChecklist
            vm={makeVm(over)}
            persona="nutrition"
            demo={null}
            brand={BRAND}
            needsBrand={false}
            showsEvaBadge
            {...props}
        />
    )
}

describe('CoachOnboardingChecklist — bloque de cabecera', () => {
    it('pinta los 5 pasos de la PERSONA, no los de fuerza', () => {
        renderTop()
        expect(screen.getByText('Arma la pauta de Ana desde una plantilla')).toBeTruthy()
        expect(screen.queryByText(/rutina de Matías/)).toBeNull()
        expect(screen.getByText('0/5')).toBeTruthy()
    })

    it('el progreso refleja los pasos tildados', () => {
        renderTop({
            done: 2,
            completed: {
                profile_branding: true,
                vive_tu_app: true,
                first_artifact: false,
                first_client: false,
                aha: false,
            },
        })
        expect(screen.getByText('2/5')).toBeTruthy()
        expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2')
    })

    it('sin persona elegida ofrece la tarjeta de especialidad', () => {
        renderTop({ persona: 'other' }, { persona: null })
        expect(screen.getByText('Elige tu especialidad y ordenamos tu panel')).toBeTruthy()
    })

    it('con persona elegida NO molesta con la tarjeta de especialidad', () => {
        renderTop()
        expect(screen.queryByText('Elige tu especialidad y ordenamos tu panel')).toBeNull()
    })

    it('la tarjeta de marca aparece solo mientras el coach no tenga marca', () => {
        renderTop({}, { needsBrand: true })
        expect(screen.getByText('Tu marca en 60 segundos')).toBeTruthy()
    })

    it('sin `needsBrand` la tarjeta de marca no se pinta', () => {
        renderTop()
        expect(screen.queryByText('Tu marca en 60 segundos')).toBeNull()
    })

    it('el alumno de ejemplo se etiqueta y avisa que no ocupa cupo', () => {
        renderTop({}, { demo: DEMO })
        expect(screen.getByText(/Paciente de ejemplo · no ocupa tu cupo/)).toBeTruthy()
        // KPI sin dato: placeholder honesto, no un cero.
        expect(screen.getByText('se carga al abrir')).toBeTruthy()
    })

    it('al llegar al pie deja de pintarse arriba', () => {
        const { container } = renderTop({ atFoot: true, allDone: true, done: 5 })
        expect(container.innerHTML).toBe('')
    })

    it('mientras hidrata muestra un esqueleto, no un salto de layout', () => {
        const { container } = renderTop({ ready: false })
        expect(container.querySelector('.animate-pulse')).toBeTruthy()
    })
})

describe('OnboardingGuideFooterStrip — tira del pie', () => {
    it('no se pinta mientras la guía vive arriba', () => {
        const { container } = render(<OnboardingGuideFooterStrip vm={makeVm()} hasDemo={false} />)
        expect(container.innerHTML).toBe('')
    })

    it('al completar 5/5 anuncia el progreso completo', () => {
        render(
            <OnboardingGuideFooterStrip vm={makeVm({ atFoot: true, allDone: true, done: 5 })} hasDemo={false} />
        )
        expect(screen.getByText('Guía de inicio completada 5/5')).toBeTruthy()
    })

    it('ocultada a medias, conserva el contador sin decir «completada»', () => {
        render(<OnboardingGuideFooterStrip vm={makeVm({ atFoot: true, done: 2 })} hasDemo={false} />)
        expect(screen.getByText('Guía de inicio 2/5')).toBeTruthy()
    })

    it('ofrece «Borrar ejemplo» solo si hay alumno de ejemplo', () => {
        const vm = makeVm({ atFoot: true, allDone: true, done: 5 })
        const { rerender } = render(<OnboardingGuideFooterStrip vm={vm} hasDemo={false} />)
        expect(screen.queryByText('Borrar ejemplo')).toBeNull()

        rerender(<OnboardingGuideFooterStrip vm={vm} hasDemo />)
        expect(screen.getByText('Borrar ejemplo')).toBeTruthy()
    })

    it('con la guía apagada no queda ni la tira', () => {
        const { container } = render(
            <OnboardingGuideFooterStrip vm={makeVm({ atFoot: true, hidden: true })} hasDemo />
        )
        expect(container.innerHTML).toBe('')
    })
})

describe('withPrimeraFlag — el paso 3 abre la tarea guiada (W4 F4.3)', () => {
    it('agrega ?primera=1 cuando la ruta no tiene query', () => {
        expect(withPrimeraFlag('/coach/movement/abc')).toBe('/coach/movement/abc?primera=1')
    })

    it('lo agrega con & cuando ya hay query', () => {
        expect(withPrimeraFlag('/coach/settings?tour=1')).toBe('/coach/settings?tour=1&primera=1')
    })

    it('no lo duplica', () => {
        expect(withPrimeraFlag('/coach/cardio/abc?primera=1')).toBe('/coach/cardio/abc?primera=1')
    })

    it('un paso que no navega sigue sin navegar', () => {
        expect(withPrimeraFlag(null)).toBeNull()
    })
})
