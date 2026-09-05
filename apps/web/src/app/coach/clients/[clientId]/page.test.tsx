import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

/**
 * B11 (Ola de orden, TASKS.md) — pinnea el ctx EXACTO con el que `/coach/clients/[clientId]`
 * llama a `resolveDomainsEnabled`: mismo shape que `_data/ficha-panel.data.ts` (`coachId` +
 * `clientTeamId` + `clientOrgId`, SIN `clientId` ni `audience`), para que la ruta standalone y el
 * panel del master-detail nunca muestren pestañas distintas para la MISMA ficha (W1.8 · 4A).
 */

const getClientProfileData = vi.fn()
const getEnabledModulesForRender = vi.fn()
const resolveDomainsEnabled = vi.fn()
const resolveNutritionTabV2 = vi.fn()
const getCoachOnboardingEmptyContext = vi.fn()
const redirectMock = vi.fn()
/** Últimos `domainsEnabled` que le llegaron al dashboard — así se ve el resultado, no solo el ctx. */
const domainsEnabledSeen: unknown[] = []

vi.mock('./_actions/client-detail.actions', () => ({
    getClientProfileData: (...args: unknown[]) => getClientProfileData(...args),
}))

vi.mock('@/services/entitlements-render-cache', () => ({
    getEnabledModulesForRender: (...args: unknown[]) => getEnabledModulesForRender(...args),
    hasModuleFromMap: (modules: Record<string, boolean> | undefined, key: string) =>
        modules?.[key] === true,
}))

vi.mock('@/services/feature-prefs.service', () => ({
    resolveDomainsEnabled: (...args: unknown[]) => resolveDomainsEnabled(...args),
}))

vi.mock('@/services/dashboard.service', () => ({
    applyNutritionAttentionScore: (base: number, atRisk: boolean | null | undefined) =>
        atRisk === true ? base + 1 : base,
}))

vi.mock('./_data/nutrition-tab-v2.data', () => ({
    resolveNutritionTabV2: (...args: unknown[]) => resolveNutritionTabV2(...args),
}))

vi.mock('../../_data/onboarding-empty.queries', () => ({
    getCoachOnboardingEmptyContext: (...args: unknown[]) => getCoachOnboardingEmptyContext(...args),
}))

vi.mock('next/navigation', () => ({
    redirect: (...args: unknown[]) => redirectMock(...args),
}))

vi.mock('./ClientProfileHero', () => ({ ClientProfileHero: () => null }))
vi.mock('./_components/DemoStudentBanner', () => ({ DemoStudentBanner: () => null }))
vi.mock('./ClientProfileDashboard', () => ({
    ClientProfileDashboard: (props: { domainsEnabled: unknown }) => {
        domainsEnabledSeen.push(props.domainsEnabled)
        return null
    },
}))

import ClientProfilePage from './page'

const CLIENT_ID = 'client-1'
const COACH_ID = 'coach-1'

function baseClient(overrides: Record<string, unknown> = {}) {
    return {
        full_name: 'Alumno de prueba',
        email: 'alumno@test.cl',
        phone: null,
        subscription_start_date: null,
        created_at: '2026-01-01',
        is_active: true,
        is_archived: false,
        is_demo: false,
        coach_id: COACH_ID,
        team_id: null,
        org_id: null,
        coaches: { slug: 'coach-slug' },
        ...overrides,
    }
}

function baseProfileData(overrides: Record<string, unknown> = {}) {
    return {
        client: baseClient(),
        nutritionPlans: [],
        checkIns: [],
        compliance: null,
        profileLastActivityAt: null,
        attentionScore: 0,
        activeProgram: null,
        ...overrides,
    }
}

/**
 * `ProfileContent` es un Server Component ANIDADO adentro de `<Suspense>`: React solo ejecuta su
 * cuerpo async al renderizarlo, no al armar el árbol (`<ProfileContent clientId={clientId} />`
 * es apenas un descriptor). No está exportado — no hay bug que justifique exportarlo solo para
 * testearlo — así que este helper extrae el elemento del árbol que devuelve la page y llama a su
 * `type` (la función real) con sus propios `props`, exactamente lo que React haría al pintarlo.
 */
async function renderProfileContent() {
    const tree = (await ClientProfilePage({
        params: Promise.resolve({ clientId: CLIENT_ID }),
    })) as ReactElement
    const children = (tree.props as { children: ReactElement[] }).children
    const suspense = children[1]
    const inner = (suspense.props as { children: ReactElement }).children
    if (!isValidElement(inner)) throw new Error('ProfileContent no encontrado en el árbol de la page')
    return (inner.type as (p: unknown) => Promise<ReactElement>)(inner.props)
}

describe('ClientProfilePage — ctx exacto de resolveDomainsEnabled (B11)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        domainsEnabledSeen.length = 0
        getClientProfileData.mockResolvedValue(baseProfileData())
        getEnabledModulesForRender.mockResolvedValue({})
        resolveNutritionTabV2.mockResolvedValue(null)
        getCoachOnboardingEmptyContext.mockResolvedValue({ demoLabel: 'Alumno de ejemplo' })
        resolveDomainsEnabled.mockResolvedValue({
            nutrition: true,
            training: true,
            cardio: true,
            movement: true,
            bodycomp: true,
        })
    })

    it('standalone (sin team ni org): ctx con las dos keys en null, sin clientId ni audience', async () => {
        await renderProfileContent()

        expect(resolveDomainsEnabled).toHaveBeenCalledTimes(1)
        expect(resolveDomainsEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: null,
            clientOrgId: null,
        })
        // El override por-alumno NO debe apagar pestañas acá (4A): sin `clientId` a propósito.
        const ctx = resolveDomainsEnabled.mock.calls[0][0] as Record<string, unknown>
        expect(ctx).not.toHaveProperty('clientId')
        expect(ctx).not.toHaveProperty('audience')
    })

    it('alumno de pool / enterprise: propaga team_id y org_id del alumno tal cual', async () => {
        getClientProfileData.mockResolvedValue(
            baseProfileData({ client: baseClient({ team_id: 'team-9', org_id: 'org-9' }) }),
        )

        await renderProfileContent()

        expect(resolveDomainsEnabled).toHaveBeenCalledWith({
            coachId: COACH_ID,
            clientTeamId: 'team-9',
            clientOrgId: 'org-9',
        })
    })

    it('sin coach dueño: NO llama a resolveDomainsEnabled y el dashboard recibe el fail-open ({})', async () => {
        getClientProfileData.mockResolvedValue(
            baseProfileData({ client: baseClient({ coach_id: null }) }),
        )

        await renderProfileContent()

        expect(resolveDomainsEnabled).not.toHaveBeenCalled()
        expect(domainsEnabledSeen.at(-1)).toEqual({})
    })

    it('coach con los 5 dominios apagados: el resultado llega intacto al dashboard (mismo objeto)', async () => {
        const allOff = {
            nutrition: false,
            training: false,
            cardio: false,
            movement: false,
            bodycomp: false,
        }
        resolveDomainsEnabled.mockResolvedValue(allOff)

        await renderProfileContent()

        expect(domainsEnabledSeen.at(-1)).toEqual(allOff)
    })
})
