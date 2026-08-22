import { describe, expect, it } from 'vitest'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAINS,
    FEATURE_DOMAIN_KEYS,
    NUTRITION_SECTIONS,
    PRESETS,
    disabledDomainsForPersona,
    normalizePreset,
    resolveDomainEnabled,
    resolvePersonaPrefs,
    resolveSections,
    type FeatureDomain,
    type ModuleKey,
    type NutritionSectionKey,
} from './index'
// Fuente de verdad de las keys (la app es la duena; el paquete es puro y la espeja).
import { MODULE_KEYS } from '@/services/entitlements.service'
// Fuente de verdad de las personas (espejo del CHECK de `coaches.persona`).
import { PERSONAS, type Persona } from '@eva/schemas'

const ALL_ENTITLED: Partial<Record<ModuleKey, boolean>> = {
    cardio: true,
    movement_assessment: true,
    body_composition: true,
    nutrition_exchanges: true,
}
const NONE_ENTITLED: Partial<Record<ModuleKey, boolean>> = {}

const CORE_KEYS: NutritionSectionKey[] = ['plan', 'macros', 'adherence']

function on(...keys: NutritionSectionKey[]): Partial<Record<NutritionSectionKey, boolean>> {
    return Object.fromEntries(keys.map((k) => [k, true]))
}

describe('@eva/feature-prefs — catalogo', () => {
    it('cada requiresModule es un MODULE_KEYS valido', () => {
        const valid = new Set<string>(MODULE_KEYS)
        for (const section of NUTRITION_SECTIONS) {
            if (section.requiresModule !== null) {
                expect(valid.has(section.requiresModule)).toBe(true)
            }
        }
    })

    it('las secciones core estan ON en los 3 presets y no requieren modulo', () => {
        for (const section of NUTRITION_SECTIONS) {
            if (!section.core) continue
            expect(section.requiresModule).toBeNull()
            expect(section.presets.basico).toBe(true)
            expect(section.presets.intermedio).toBe(true)
            expect(section.presets.profesional).toBe(true)
        }
    })

    it('basico = solo core', () => {
        for (const section of NUTRITION_SECTIONS) {
            expect(section.presets.basico).toBe(section.core)
        }
    })

    it('intermedio agrega las opcionales gratis (no las Pro)', () => {
        const intermedioExtras: NutritionSectionKey[] = [
            'micros_base',
            'plate',
            'off_plan_log',
            'notes',
            'habits',
            'recipes',
            'shopping',
        ]
        for (const section of NUTRITION_SECTIONS) {
            if (section.core) continue
            const expected = intermedioExtras.includes(section.key)
            expect(section.presets.intermedio).toBe(expected)
        }
    })

    it('profesional agrega micros_advanced + goals_bodycomp (todo lo demas tambien ON)', () => {
        for (const section of NUTRITION_SECTIONS) {
            expect(section.presets.profesional).toBe(true)
        }
        const advanced = NUTRITION_SECTIONS.find((s) => s.key === 'micros_advanced')
        const bodycomp = NUTRITION_SECTIONS.find((s) => s.key === 'goals_bodycomp')
        expect(advanced?.requiresModule).toBe('nutrition_exchanges')
        expect(bodycomp?.requiresModule).toBe('body_composition')
        expect(advanced?.presets.intermedio).toBe(false)
        expect(bodycomp?.presets.intermedio).toBe(false)
    })

    it('normalizePreset coacciona basura/ausente a basico', () => {
        expect(normalizePreset('basico')).toBe('basico')
        expect(normalizePreset('intermedio')).toBe('intermedio')
        expect(normalizePreset('profesional')).toBe('profesional')
        expect(normalizePreset('garbage')).toBe('basico')
        expect(normalizePreset(undefined)).toBe('basico')
        expect(normalizePreset(null)).toBe('basico')
        expect(normalizePreset(42)).toBe('basico')
        expect([...PRESETS]).toEqual(['basico', 'intermedio', 'profesional'])
    })
})

describe('@eva/feature-prefs — resolveSections', () => {
    it('core siempre ON aunque la preferencia las apague', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { plan: false, macros: false, adherence: false },
            useTeamBase: false,
        })
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
    })

    it('preset basico → solo core ON', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            useTeamBase: false,
        })
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
        expect(res.micros_base).toBe(false)
        expect(res.recipes).toBe(false)
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preset intermedio → core + opcionales gratis ON, Pro OFF', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            useTeamBase: false,
        })
        expect(res.micros_base).toBe(true)
        expect(res.plate).toBe(true)
        expect(res.recipes).toBe(true)
        // Entitled + en preset profesional only → intermedio NO las prende.
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preset profesional + entitled → secciones Pro ON', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'profesional',
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(true)
        expect(res.goals_bodycomp).toBe(true)
    })

    it('entitled AND enabled: preset profesional pero SIN entitlement → Pro OFF', () => {
        const res = resolveSections({
            entitledByModule: NONE_ENTITLED,
            preset: 'profesional',
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
        // las gratis del preset profesional siguen ON
        expect(res.micros_base).toBe(true)
    })

    it('preferencia NO puede ampliar lo no-entitled', () => {
        const res = resolveSections({
            entitledByModule: NONE_ENTITLED,
            preset: 'basico',
            coachSections: on('micros_advanced', 'goals_bodycomp'),
            clientSections: on('micros_advanced', 'goals_bodycomp'),
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })

    it('preferencia entitled puede prender una seccion fuera del preset', () => {
        const res = resolveSections({
            entitledByModule: { nutrition_exchanges: true },
            preset: 'basico',
            coachSections: on('micros_advanced'),
            useTeamBase: false,
        })
        expect(res.micros_advanced).toBe(true)
        // body_composition NO entitled → sigue OFF aunque el preset/coach no la pida
        expect(res.goals_bodycomp).toBe(false)
    })

    it('client override gana sobre coach (prende)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: false },
            clientSections: { recipes: true },
            useTeamBase: false,
        })
        expect(res.recipes).toBe(true)
    })

    it('client override gana sobre coach (apaga)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            coachSections: { recipes: true },
            clientSections: { recipes: false },
            useTeamBase: false,
        })
        expect(res.recipes).toBe(false)
    })

    it('fila de alumno ausente → hereda coach (no fuerza OFF)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: true },
            clientSections: { plate: false }, // recipes ausente en client
            useTeamBase: false,
        })
        expect(res.recipes).toBe(true)
    })

    it('useTeamBase → la base es team, ignora coach', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { recipes: true }, // ignorado en modo team
            teamSections: { recipes: false, plate: true },
            useTeamBase: true,
        })
        expect(res.recipes).toBe(false)
        expect(res.plate).toBe(true)
    })

    it('useTeamBase + client override sigue ganando sobre team', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            teamSections: { recipes: false },
            clientSections: { recipes: true },
            useTeamBase: true,
        })
        expect(res.recipes).toBe(true)
    })

    it('preset basura → tratado como basico', () => {
        const garbage = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'no-existe',
            useTeamBase: false,
        })
        const basico = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            useTeamBase: false,
        })
        expect(garbage).toEqual(basico)
    })

    it('preset null → basico', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: null,
            useTeamBase: false,
        })
        expect(res.micros_base).toBe(false)
        for (const k of CORE_KEYS) expect(res[k]).toBe(true)
    })
})

describe('@eva/feature-prefs — master switch del dominio (_enabled)', () => {
    it('DOMAIN_ENABLED_KEY es la key reservada "_enabled"', () => {
        expect(DOMAIN_ENABLED_KEY).toBe('_enabled')
    })

    it('default true: sin la key _enabled el dominio esta prendido', () => {
        expect(
            resolveDomainEnabled({
                entitledByModule: ALL_ENTITLED,
                preset: 'basico',
                useTeamBase: false,
            }),
        ).toBe(true)
        expect(
            resolveDomainEnabled({
                entitledByModule: ALL_ENTITLED,
                preset: 'intermedio',
                coachSections: { recipes: true },
                useTeamBase: false,
            }),
        ).toBe(true)
    })

    it('coach _enabled:false apaga el dominio', () => {
        expect(
            resolveDomainEnabled({
                entitledByModule: ALL_ENTITLED,
                preset: 'profesional',
                coachSections: { [DOMAIN_ENABLED_KEY]: false },
                useTeamBase: false,
            }),
        ).toBe(false)
    })

    it('dominio apagado → TODAS las secciones false, incluidas las core', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'profesional',
            coachSections: { [DOMAIN_ENABLED_KEY]: false },
            useTeamBase: false,
        })
        for (const section of NUTRITION_SECTIONS) {
            expect(res[section.key]).toBe(false)
        }
        // explicitamente: las core tambien caen
        for (const k of CORE_KEYS) expect(res[k]).toBe(false)
    })

    it('client _enabled override gana sobre coach (apaga)', () => {
        const input = {
            entitledByModule: ALL_ENTITLED,
            preset: 'profesional' as const,
            coachSections: { [DOMAIN_ENABLED_KEY]: true },
            clientSections: { [DOMAIN_ENABLED_KEY]: false },
            useTeamBase: false,
        }
        expect(resolveDomainEnabled(input)).toBe(false)
        for (const k of CORE_KEYS) expect(resolveSections(input)[k]).toBe(false)
    })

    it('client _enabled override gana sobre coach (prende un dominio apagado por coach)', () => {
        const input = {
            entitledByModule: ALL_ENTITLED,
            preset: 'basico' as const,
            coachSections: { [DOMAIN_ENABLED_KEY]: false },
            clientSections: { [DOMAIN_ENABLED_KEY]: true },
            useTeamBase: false,
        }
        expect(resolveDomainEnabled(input)).toBe(true)
        // dominio prendido → core vuelven a ON
        for (const k of CORE_KEYS) expect(resolveSections(input)[k]).toBe(true)
    })

    it('useTeamBase → la base del _enabled es el team, ignora coach', () => {
        const input = {
            entitledByModule: ALL_ENTITLED,
            preset: 'basico' as const,
            coachSections: { [DOMAIN_ENABLED_KEY]: false }, // ignorado en modo team
            teamSections: { [DOMAIN_ENABLED_KEY]: true },
            useTeamBase: true,
        }
        expect(resolveDomainEnabled(input)).toBe(true)
        for (const k of CORE_KEYS) expect(resolveSections(input)[k]).toBe(true)
    })

    it('team _enabled:false apaga el dominio en modo team', () => {
        const input = {
            entitledByModule: ALL_ENTITLED,
            preset: 'profesional' as const,
            teamSections: { [DOMAIN_ENABLED_KEY]: false },
            useTeamBase: true,
        }
        expect(resolveDomainEnabled(input)).toBe(false)
        for (const section of NUTRITION_SECTIONS) {
            expect(resolveSections(input)[section.key]).toBe(false)
        }
    })

    it('_enabled:true es no-op: identico a no setearlo', () => {
        const withKey = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            coachSections: { [DOMAIN_ENABLED_KEY]: true, recipes: true },
            useTeamBase: false,
        })
        const without = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'intermedio',
            coachSections: { recipes: true },
            useTeamBase: false,
        })
        expect(withKey).toEqual(without)
    })

    it('_enabled NO se trata como una seccion iterable (no aparece en el output)', () => {
        const res = resolveSections({
            entitledByModule: ALL_ENTITLED,
            preset: 'basico',
            coachSections: { [DOMAIN_ENABLED_KEY]: true },
            useTeamBase: false,
        })
        expect(res[DOMAIN_ENABLED_KEY]).toBeUndefined()
    })
})

describe('@eva/feature-prefs — dominios del onboarding v2 (SPEC §2)', () => {
    it('el registro tiene los 5 dominios de la matriz', () => {
        expect(Object.keys(FEATURE_DOMAINS).sort()).toEqual(
            ['bodycomp', 'cardio', 'movement', 'nutrition', 'training'],
        )
        expect([...FEATURE_DOMAIN_KEYS].sort()).toEqual(Object.keys(FEATURE_DOMAINS).sort())
    })

    it('toda seccion core (de cualquier dominio) es gratis y esta en los 3 presets', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            for (const section of FEATURE_DOMAINS[domain]) {
                if (!section.core) continue
                expect(section.requiresModule).toBeNull()
                expect(section.presets.basico).toBe(true)
                expect(section.presets.intermedio).toBe(true)
                expect(section.presets.profesional).toBe(true)
            }
        }
    })

    it('resolveSections funciona en TODOS los dominios (sin prefs: las core prendidas)', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            const res = resolveSections({
                entitledByModule: NONE_ENTITLED,
                preset: 'basico',
                useTeamBase: false,
                domain,
            })
            for (const section of FEATURE_DOMAINS[domain]) {
                if (section.core) expect(res[section.key]).toBe(true)
            }
        }
    })

    it('el master switch apaga CUALQUIER dominio, incluidas sus core', () => {
        for (const domain of FEATURE_DOMAIN_KEYS) {
            const input = {
                entitledByModule: ALL_ENTITLED,
                preset: 'profesional' as const,
                coachSections: { [DOMAIN_ENABLED_KEY]: false },
                useTeamBase: false,
                domain,
            }
            expect(resolveDomainEnabled(input)).toBe(false)
            const res = resolveSections(input)
            for (const section of FEATURE_DOMAINS[domain]) {
                expect(res[section.key]).toBe(false)
            }
        }
    })
})

describe('@eva/feature-prefs — resolvePersonaPrefs (matriz de SPEC §2)', () => {
    // Matriz esperada: [dominios ON] por persona, con la segunda pregunta en NO.
    const BASE_ON: Record<Persona, FeatureDomain[]> = {
        strength: ['training'],
        nutrition: ['nutrition', 'bodycomp'],
        rehab: ['training', 'movement'],
        endurance: ['training', 'cardio'],
        other: ['nutrition', 'training', 'cardio', 'movement', 'bodycomp'],
    }
    // Lo que agrega la segunda pregunta ([Sí]): nutricion para 1/3/4, entrenamiento para el nutri.
    const ALSO_OTHER_ADDS: Record<Persona, FeatureDomain[]> = {
        strength: ['nutrition'],
        nutrition: ['training'],
        rehab: ['nutrition'],
        endurance: ['nutrition'],
        other: [],
    }

    const enabledDomains = (persona: Persona, alsoOther: boolean): FeatureDomain[] => {
        const prefs = resolvePersonaPrefs(persona, alsoOther)
        return FEATURE_DOMAIN_KEYS.filter((d) => prefs[d][DOMAIN_ENABLED_KEY])
    }

    it('siempre devuelve los 5 dominios con su `_enabled` explicito', () => {
        for (const persona of PERSONAS) {
            for (const alsoOther of [false, true]) {
                const prefs = resolvePersonaPrefs(persona, alsoOther)
                expect(Object.keys(prefs).sort()).toEqual([...FEATURE_DOMAIN_KEYS].sort())
                for (const domain of FEATURE_DOMAIN_KEYS) {
                    expect(typeof prefs[domain][DOMAIN_ENABLED_KEY]).toBe('boolean')
                }
            }
        }
    })

    it('matriz completa: 5 personas x 2 valores de la segunda pregunta', () => {
        for (const persona of PERSONAS) {
            expect({ persona, on: enabledDomains(persona, false).sort() }).toEqual({
                persona,
                on: [...BASE_ON[persona]].sort(),
            })
            expect({ persona, on: enabledDomains(persona, true).sort() }).toEqual({
                persona,
                on: [...BASE_ON[persona], ...ALSO_OTHER_ADDS[persona]].sort(),
            })
        }
    })

    it('la segunda pregunta SOLO agrega (nunca apaga lo que ya estaba)', () => {
        for (const persona of PERSONAS) {
            const withoutIt = new Set(enabledDomains(persona, false))
            const withIt = new Set(enabledDomains(persona, true))
            for (const domain of withoutIt) expect(withIt.has(domain)).toBe(true)
        }
    })

    it('`other` deja el panel completo con cualquier respuesta', () => {
        for (const alsoOther of [false, true]) {
            expect(enabledDomains('other', alsoOther)).toEqual([...FEATURE_DOMAIN_KEYS])
        }
    })

    it('composicion corporal entra con nutricion y con nadie mas (salvo other)', () => {
        expect(resolvePersonaPrefs('nutrition', false).bodycomp[DOMAIN_ENABLED_KEY]).toBe(true)
        for (const persona of ['strength', 'rehab', 'endurance'] as const) {
            expect(resolvePersonaPrefs(persona, true).bodycomp[DOMAIN_ENABLED_KEY]).toBe(false)
        }
    })

    it('disabledDomainsForPersona es el complemento exacto (lo que consume el nav)', () => {
        for (const persona of PERSONAS) {
            for (const alsoOther of [false, true]) {
                const on = new Set(enabledDomains(persona, alsoOther))
                const off = disabledDomainsForPersona(persona, alsoOther)
                expect(off.size + on.size).toBe(FEATURE_DOMAIN_KEYS.length)
                for (const domain of off) expect(on.has(domain)).toBe(false)
            }
        }
    })

    it('la persona nunca prende una seccion que el entitlement no permite (solo achica)', () => {
        // Con la segunda pregunta en [Si], `endurance` prende el dominio nutricion — pero sus
        // secciones de PAGO siguen gateadas por el entitlement (la preferencia no compra nada).
        const prefs = resolvePersonaPrefs('endurance', true)
        expect(prefs.nutrition[DOMAIN_ENABLED_KEY]).toBe(true)
        const res = resolveSections({
            entitledByModule: NONE_ENTITLED,
            preset: 'profesional',
            coachSections: prefs.nutrition,
            useTeamBase: false,
            domain: 'nutrition',
        })
        expect(res.micros_advanced).toBe(false)
        expect(res.goals_bodycomp).toBe(false)
    })
})
