import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getVisibleNavItems } from '@eva/coach-nav'
import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'

type CaptureInput = {
    event: string
    distinctId: string
    properties?: Record<string, string | number | boolean | null>
    set?: Record<string, string | number | boolean | null>
}
const captureMock = vi.hoisted(() => vi.fn<(input: CaptureInput) => Promise<void>>(async () => {}))
vi.mock('@/lib/posthog/server-capture', () => ({ capturePostHogServerEvent: captureMock }))

import {
    buildPersonaPrefsUpsert,
    disabledDomainsFromPrefs,
    isCoachCreatedAfterPersonaLaunch,
    isPersonaGateExemptPath,
    personaGateApplies,
    recordOnboardingEvent,
    shouldRedirectToPersona,
    type CoachDomainPrefsRow,
    type PersonaGateInput,
} from './persona.service'

/**
 * Gate D8 + siembra de preferencias por persona (SPEC coach-onboarding-v2 §1-§2).
 * Todo lo testeado acá es PURO: es exactamente el motivo por el que el gate vive en un resolver
 * y no dentro del proxy (donde no se puede unit-testear sin request ni Supabase).
 */

const NUEVO = '2026-08-25T10:00:00Z'
const VIEJO = '2026-07-01T10:00:00Z'

function gate(overrides: Partial<PersonaGateInput> = {}): PersonaGateInput {
    return {
        pathname: '/coach/dashboard',
        persona: null,
        subscriptionStatus: 'active',
        workspaceType: 'coach_standalone',
        coachCreatedAt: NUEVO,
        realClientCount: null,
        ...overrides,
    }
}

describe('shouldRedirectToPersona (gate D8)', () => {
    it('coach nuevo sin persona: va a la pantalla aunque no se haya contado alumnos', () => {
        expect(shouldRedirectToPersona(gate())).toBe(true)
    })

    it('coach viejo sin persona y sin alumnos reales: también va', () => {
        expect(shouldRedirectToPersona(gate({ coachCreatedAt: VIEJO, realClientCount: 0 }))).toBe(true)
    })

    it('coach viejo con alumnos: NO se le interrumpe el panel (la tarjeta la muestra el dashboard)', () => {
        expect(shouldRedirectToPersona(gate({ coachCreatedAt: VIEJO, realClientCount: 3 }))).toBe(false)
    })

    it('coach viejo con conteo desconocido: fail-open, no redirige', () => {
        expect(shouldRedirectToPersona(gate({ coachCreatedAt: VIEJO, realClientCount: null }))).toBe(false)
    })

    it('persona ya elegida: nunca más', () => {
        expect(shouldRedirectToPersona(gate({ persona: 'strength' }))).toBe(false)
        expect(shouldRedirectToPersona(gate({ persona: 'other' }))).toBe(false)
    })

    it('coach managed (org/team) queda fuera, por status y por workspace', () => {
        expect(shouldRedirectToPersona(gate({ subscriptionStatus: 'org_managed' }))).toBe(false)
        expect(shouldRedirectToPersona(gate({ subscriptionStatus: 'team_managed' }))).toBe(false)
        expect(shouldRedirectToPersona(gate({ workspaceType: 'coach_team' }))).toBe(false)
        expect(shouldRedirectToPersona(gate({ workspaceType: 'enterprise_coach' }))).toBe(false)
    })

    it('rutas exentas: la pantalla misma, el alta OAuth, reactivar y suscripción', () => {
        for (const pathname of [
            '/coach/onboarding/persona',
            '/coach/onboarding/complete',
            '/coach/reactivate',
            '/coach/subscription',
            '/coach/subscription/success',
        ]) {
            expect(isPersonaGateExemptPath(pathname)).toBe(true)
            expect(shouldRedirectToPersona(gate({ pathname }))).toBe(false)
        }
    })

    it('rutas normales del panel NO están exentas', () => {
        expect(isPersonaGateExemptPath('/coach/dashboard')).toBe(false)
        expect(isPersonaGateExemptPath('/coach/clients')).toBe(false)
        // Prefijo parecido pero distinto: no puede colarse por `startsWith` suelto.
        expect(isPersonaGateExemptPath('/coach/subscriptions-fake')).toBe(false)
    })

    it('personaGateApplies corta ANTES de contar alumnos (chequeos baratos)', () => {
        expect(
            personaGateApplies({
                pathname: '/coach/dashboard',
                persona: null,
                subscriptionStatus: 'active',
                workspaceType: null,
            }),
        ).toBe(true)
        expect(
            personaGateApplies({
                pathname: '/coach/dashboard',
                persona: 'nutrition',
                subscriptionStatus: 'active',
                workspaceType: null,
            }),
        ).toBe(false)
    })

    it('el corte de coach nuevo es la fecha de lanzamiento; fecha inválida o ausente => viejo', () => {
        expect(isCoachCreatedAfterPersonaLaunch('2026-08-22T00:00:00Z')).toBe(true)
        expect(isCoachCreatedAfterPersonaLaunch('2026-08-21T23:59:59Z')).toBe(false)
        expect(isCoachCreatedAfterPersonaLaunch(null)).toBe(false)
        expect(isCoachCreatedAfterPersonaLaunch('no-es-fecha')).toBe(false)
    })
})

describe('buildPersonaPrefsUpsert', () => {
    const NOW = new Date('2026-08-22T12:00:00Z')

    function enabledByDomain(rows: ReturnType<typeof buildPersonaPrefsUpsert>) {
        return Object.fromEntries(
            rows.map((row) => [
                row.domain,
                (row.sections as Record<string, boolean>)[DOMAIN_ENABLED_KEY],
            ]),
        )
    }

    it('strength sin segunda pregunta: solo entrenamiento', () => {
        const rows = buildPersonaPrefsUpsert('coach-1', 'strength', false, [], NOW)
        expect(rows).toHaveLength(5)
        expect(enabledByDomain(rows)).toEqual({
            nutrition: false,
            training: true,
            cardio: false,
            movement: false,
            bodycomp: false,
        })
    })

    it('strength con «también les armo la alimentación»: suma nutrición', () => {
        expect(enabledByDomain(buildPersonaPrefsUpsert('coach-1', 'strength', true, [], NOW)).nutrition).toBe(true)
    })

    it('nutrition trae composición corporal siempre', () => {
        expect(enabledByDomain(buildPersonaPrefsUpsert('coach-1', 'nutrition', false, [], NOW))).toEqual({
            nutrition: true,
            training: false,
            cardio: false,
            movement: false,
            bodycomp: true,
        })
    })

    it('other deja el panel completo', () => {
        const enabled = enabledByDomain(buildPersonaPrefsUpsert('coach-1', 'other', false, [], NOW))
        expect(Object.values(enabled).every((value) => value === true)).toBe(true)
    })

    it('preserva las secciones y el preset ya guardados: solo pisa el master switch', () => {
        const existing: CoachDomainPrefsRow[] = [
            {
                domain: 'nutrition',
                preset: 'profesional',
                sections: { recipes: true, habits: false, [DOMAIN_ENABLED_KEY]: true },
            },
        ]
        const rows = buildPersonaPrefsUpsert('coach-1', 'strength', false, existing, NOW)
        const nutrition = rows.find((row) => row.domain === 'nutrition')!
        expect(nutrition.preset).toBe('profesional')
        expect(nutrition.sections).toEqual({
            recipes: true,
            habits: false,
            [DOMAIN_ENABLED_KEY]: false,
        })
        // Dominio sin fila previa: preset seguro por default.
        expect(rows.find((row) => row.domain === 'cardio')!.preset).toBe('basico')
        expect(rows.every((row) => row.coach_id === 'coach-1')).toBe(true)
        expect(rows.every((row) => row.updated_at === NOW.toISOString())).toBe(true)
    })
})

describe('disabledDomainsFromPrefs → nav por dominio', () => {
    it('solo apaga los dominios con `_enabled: false`; sin fila = visible', () => {
        const rows: CoachDomainPrefsRow[] = [
            { domain: 'nutrition', preset: null, sections: { [DOMAIN_ENABLED_KEY]: false } },
            { domain: 'cardio', preset: null, sections: { [DOMAIN_ENABLED_KEY]: false } },
            { domain: 'training', preset: null, sections: { [DOMAIN_ENABLED_KEY]: true } },
            // Fila sin la key reservada (solo secciones): no apaga nada.
            { domain: 'movement', preset: 'basico', sections: { screening: true } },
        ]
        expect(disabledDomainsFromPrefs(rows).sort()).toEqual(['cardio', 'nutrition'])
    })

    it('el nav esconde Nutrición y Cardio, y conserva Programas y Movimiento', () => {
        const rows: CoachDomainPrefsRow[] = [
            { domain: 'nutrition', preset: null, sections: { [DOMAIN_ENABLED_KEY]: false } },
            { domain: 'cardio', preset: null, sections: { [DOMAIN_ENABLED_KEY]: false } },
            { domain: 'movement', preset: null, sections: { [DOMAIN_ENABLED_KEY]: true } },
        ]
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            // Módulos comprados: sin esto Cardio/Movimiento ya se ocultarían por entitlement y el
            // test no probaría el filtro por dominio.
            enabledModules: { cardio: true, movement_assessment: true },
            disabledDomains: new Set(disabledDomainsFromPrefs(rows)),
        })
        const keys = items.map((item) => item.key)
        expect(keys).toContain('programs')
        expect(keys).toContain('movement')
        expect(keys).not.toContain('nutrition')
        expect(keys).not.toContain('cardio')
    })

    it('coach sin ninguna fila de prefs: nav completo (fail-open, comportamiento de hoy)', () => {
        expect(disabledDomainsFromPrefs([])).toEqual([])
        const items = getVisibleNavItems({
            activeWorkspaceType: 'coach_standalone',
            subscriptionStatus: 'active',
            enabledModules: { cardio: true, movement_assessment: true },
            disabledDomains: new Set(disabledDomainsFromPrefs([])),
        })
        expect(items.map((item) => item.key)).toEqual(
            expect.arrayContaining(['dashboard', 'clients', 'programs', 'nutrition', 'cardio', 'movement']),
        )
    })
})

/**
 * W8.5.2 (= W0.5 de flujo-coach-nuevo): el espejo a PostHog. Lo que se pinnea acá es el CONTRATO —
 * una fila en PostHog por fila en la tabla, `distinct_id` = coach, `$set { persona }` cuando el
 * evento la trae, y best-effort de verdad (nada de esto puede romper la acción que lo dispara).
 */
describe('recordOnboardingEvent → espejo a PostHog', () => {
    function fakeAdmin(error: { message: string } | null = null) {
        const insert = vi.fn(async () => ({ error }))
        const from = vi.fn(() => ({ insert }))
        return {
            db: { from } as unknown as Parameters<typeof recordOnboardingEvent>[0],
            from,
            insert,
        }
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('espeja con el mismo nombre de evento, sus propiedades y `$set { persona }`', async () => {
        const admin = fakeAdmin()
        await recordOnboardingEvent(admin.db, {
            coachId: 'coach-1',
            eventType: 'demo_seeded',
            metadata: { persona: 'strength', demoClientId: 'demo-1', surface: 'web' },
        })

        expect(admin.from).toHaveBeenCalledWith('coach_onboarding_events')
        expect(captureMock).toHaveBeenCalledWith({
            event: 'demo_seeded',
            distinctId: 'coach-1',
            properties: {
                persona: 'strength',
                demoClientId: 'demo-1',
                surface: 'web',
                step_key: 'persona',
            },
            set: { persona: 'strength' },
        })
    })

    it('el `step_key` de la propiedad es el que quedó en la fila', async () => {
        const admin = fakeAdmin()
        await recordOnboardingEvent(admin.db, {
            coachId: 'coach-1',
            stepKey: 'vive_tu_app',
            eventType: 'vive_tu_app_opened',
            metadata: { surface: 'rn', persona: 'rehab', device: 'mobile' },
        })

        expect(admin.insert).toHaveBeenCalledWith(
            expect.objectContaining({ step_key: 'vive_tu_app', event_type: 'vive_tu_app_opened' }),
        )
        expect(captureMock).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'vive_tu_app_opened',
                properties: expect.objectContaining({ step_key: 'vive_tu_app', device: 'mobile' }),
            }),
        )
    })

    it('evento sin `persona` en el metadata: se espeja igual, pero sin `$set`', async () => {
        const admin = fakeAdmin()
        await recordOnboardingEvent(admin.db, {
            coachId: 'coach-1',
            eventType: 'demo_deleted',
            metadata: { source: 'mi_panel', deleted: true },
        })

        expect(captureMock).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'demo_deleted', set: undefined }),
        )
    })

    it('`persona_selected` NO se espeja: ya sale por el capture propio de cada call site', async () => {
        const admin = fakeAdmin()
        await recordOnboardingEvent(admin.db, {
            coachId: 'coach-1',
            eventType: 'persona_selected',
            metadata: { persona: 'nutrition', alsoOther: false, surface: 'web' },
        })

        expect(admin.insert).toHaveBeenCalledTimes(1)
        expect(captureMock).not.toHaveBeenCalled()
    })

    it('insert rechazado por la base: no se espeja (la tabla manda)', async () => {
        const admin = fakeAdmin({ message: 'duplicate key value violates unique constraint' })
        await recordOnboardingEvent(admin.db, {
            coachId: 'coach-1',
            eventType: 'demo_seeded',
            metadata: { persona: 'strength' },
        })

        expect(captureMock).not.toHaveBeenCalled()
    })

    it('la captura que explota no rompe la acción que la dispara', async () => {
        captureMock.mockRejectedValueOnce(new Error('posthog caído'))
        const admin = fakeAdmin()

        await expect(
            recordOnboardingEvent(admin.db, {
                coachId: 'coach-1',
                eventType: 'demo_seeded',
                metadata: { persona: 'strength' },
            }),
        ).resolves.toBeUndefined()
    })
})
