import { describe, expect, it } from 'vitest'
import { getVisibleNavItems } from '@eva/coach-nav'
import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'
import {
    buildPersonaPrefsUpsert,
    disabledDomainsFromPrefs,
    isCoachCreatedAfterPersonaLaunch,
    isPersonaGateExemptPath,
    personaGateApplies,
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
