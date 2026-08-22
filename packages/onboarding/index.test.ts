import { describe, expect, it } from 'vitest'
import {
    DEMO_CLIENT_TOKEN,
    DEMO_PROFILES,
    ONBOARDING_STEPS,
    ONBOARDING_STEP_KEYS,
    ONBOARDING_TOTAL_STEPS,
    RN_FIRST_STEP_PARAM,
    RN_FIRST_STEP_QUERY,
    TEMPLATE_CATALOG,
    isOnboardingComplete,
    nextStep,
    progress,
    resolveAutoCompleted,
    resolveHref,
    resolveRnRoute,
    type OnboardingSignals,
    type OnboardingStepKey,
} from './index'
// Fuente de verdad del vocabulario y del demo (el copy de acá viene resuelto y se cruza).
import { PERSONAS, PERSONA_COPY, type Persona } from '@eva/schemas'

const ALL_DONE: Record<OnboardingStepKey, boolean> = {
    profile_branding: true,
    vive_tu_app: true,
    first_artifact: true,
    first_client: true,
    aha: true,
}
const NONE_DONE: Record<OnboardingStepKey, boolean> = {
    profile_branding: false,
    vive_tu_app: false,
    first_artifact: false,
    first_client: false,
    aha: false,
}

const NO_SIGNALS: OnboardingSignals = {
    hasBrand: false,
    viveTuAppOpened: false,
    hasFirstArtifact: false,
    realClients: 0,
    realStudentActivity: false,
}

describe('@eva/onboarding — los 5 pasos por persona', () => {
    it('cada persona tiene EXACTAMENTE 5 pasos, con las 5 claves y en el orden canónico', () => {
        for (const persona of PERSONAS) {
            const steps = ONBOARDING_STEPS[persona]
            expect(steps).toHaveLength(ONBOARDING_TOTAL_STEPS)
            expect(steps.map((s) => s.key)).toEqual([...ONBOARDING_STEP_KEYS])
            expect(new Set(steps.map((s) => s.key)).size).toBe(ONBOARDING_TOTAL_STEPS)
        }
    })

    it('ningún label ni description viene vacío o con placeholder sin resolver', () => {
        for (const persona of PERSONAS) {
            for (const step of ONBOARDING_STEPS[persona]) {
                expect(step.label.trim().length).toBeGreaterThan(0)
                expect(step.description.trim().length).toBeGreaterThan(0)
                expect(step.label).not.toMatch(/\{[a-zA-Z]+\}/)
                expect(step.description).not.toMatch(/\{[a-zA-Z]+\}/)
            }
        }
    })

    it('cada paso trae la señal de auto-tilde que le corresponde', () => {
        for (const persona of PERSONAS) {
            const byKey = new Map(ONBOARDING_STEPS[persona].map((s) => [s.key, s]))
            expect(byKey.get('profile_branding')?.autoSignal).toBe('brand')
            expect(byKey.get('vive_tu_app')?.autoSignal).toBe('vive_tu_app_opened')
            expect(byKey.get('first_artifact')?.autoSignal).toBe('first_artifact')
            expect(byKey.get('first_client')?.autoSignal).toBe('real_client')
            expect(byKey.get('aha')?.autoSignal).toBe('real_student_activity')
        }
    })

    it('el paso 3 es distinto en cada rama (las ramas difieren en el trabajo, no en la redacción)', () => {
        const labels = PERSONAS.map((p) => ONBOARDING_STEPS[p][2].label)
        expect(new Set(labels).size).toBe(PERSONAS.length)
    })

    it('el paso 4 usa el sustantivo de la persona (@eva/schemas PERSONA_COPY)', () => {
        for (const persona of PERSONAS) {
            const step = ONBOARDING_STEPS[persona][3]
            expect(step.label).toBe(`Invita a tu primer ${PERSONA_COPY[persona].noun.singular}`)
        }
    })

    it('el paso 2 nombra al demo de la persona; `other` no nombra a nadie', () => {
        for (const persona of PERSONAS) {
            const description = ONBOARDING_STEPS[persona][1].description
            const demoName = PERSONA_COPY[persona].demoName
            if (demoName == null) {
                expect(description).toBe('Entra como alumno con un acceso de prueba.')
                continue
            }
            expect(description).toContain(demoName)
            expect(description).toContain(PERSONA_COPY[persona].noun.singular)
        }
    })

    it('los pasos que no navegan (vive_tu_app y aha) no tienen destino en ninguna plataforma', () => {
        for (const persona of PERSONAS) {
            const byKey = new Map(ONBOARDING_STEPS[persona].map((s) => [s.key, s]))
            for (const key of ['vive_tu_app', 'aha'] as const) {
                expect(byKey.get(key)?.webHref).toBeNull()
                expect(byKey.get(key)?.rnRoute).toBeNull()
            }
        }
    })

    it('los pasos que navegan apuntan a rutas del árbol (web /coach/..., RN /coach/...)', () => {
        for (const persona of PERSONAS) {
            for (const step of ONBOARDING_STEPS[persona]) {
                if (step.webHref != null) expect(step.webHref.startsWith('/coach/')).toBe(true)
                if (step.rnRoute != null) expect(step.rnRoute.startsWith('/coach/')).toBe(true)
            }
        }
    })

    it('el paso 3 pide el demo solo donde el trabajo es POR alumno (pauta, screening, zonas)', () => {
        // strength y other entran por el catálogo de programas: no necesitan un clientId en la URL.
        const needsDemoByPersona: Record<Persona, boolean> = {
            strength: false,
            nutrition: true,
            rehab: true,
            endurance: true,
            other: false,
        }
        for (const persona of PERSONAS) {
            const step = ONBOARDING_STEPS[persona][2]
            const webNeedsDemo = (step.webHref ?? '').includes(DEMO_CLIENT_TOKEN)
            const rnNeedsDemo = (step.rnRoute ?? '').includes(DEMO_CLIENT_TOKEN)
            expect({ persona, webNeedsDemo, rnNeedsDemo }).toEqual({
                persona,
                webNeedsDemo: needsDemoByPersona[persona],
                rnNeedsDemo: needsDemoByPersona[persona],
            })
            // Ninguna rama sin demo sembrado puede exigirlo (SPEC §4: `other` no siembra).
            if (DEMO_PROFILES[persona] == null) expect(webNeedsDemo).toBe(false)
        }
    })
})

describe('@eva/onboarding — resolveHref / resolveRnRoute', () => {
    it('con demo: no queda ningún placeholder sin resolver, en las dos plataformas', () => {
        for (const persona of PERSONAS) {
            for (const step of ONBOARDING_STEPS[persona]) {
                const web = resolveHref(step, { demoClientId: 'c0ffee00-dead-4beef-8000-000000000001' })
                const rn = resolveRnRoute(step, { demoClientId: 'c0ffee00-dead-4beef-8000-000000000001' })
                for (const target of [web, rn]) {
                    if (target == null) continue
                    expect(target).not.toContain(DEMO_CLIENT_TOKEN)
                    expect(target).not.toMatch(/\{[a-zA-Z]+\}/)
                }
            }
        }
    })

    it('sin demo: los pasos que lo necesitan devuelven null (nunca un /undefined)', () => {
        for (const persona of PERSONAS) {
            for (const step of ONBOARDING_STEPS[persona]) {
                const needsDemo = (step.webHref ?? '').includes(DEMO_CLIENT_TOKEN)
                const web = resolveHref(step, { demoClientId: null })
                if (needsDemo) expect(web).toBeNull()
                else expect(web).toBe(step.webHref)
            }
        }
    })

    it('la marca apunta a la pantalla Mi Marca en las dos superficies y el alta conserva su ?invite=1', () => {
        const brand = ONBOARDING_STEPS.strength[0]
        // Owner 22-08 («un solo onboarding por área»): el paso 1 ya no arrastra `?tour=1`. Esa
        // query no abría nada en el hub (el tour vive en /brand) y el tour de marca dejó de
        // auto-arrancar mientras la guía está activa.
        expect(resolveHref(brand, { demoClientId: null })).toBe('/coach/settings/brand')
        expect(resolveRnRoute(brand, { demoClientId: null })).toBe('/coach/settings/brand')
        const invite = ONBOARDING_STEPS.strength[3]
        expect(resolveHref(invite, { demoClientId: null })).toBe('/coach/clients?invite=1')
        expect(resolveRnRoute(invite, { demoClientId: null })).toBe('/coach/(tabs)/clientes?invite=1')
    })

    it('el id del demo viaja codificado', () => {
        const step = ONBOARDING_STEPS.rehab[2]
        expect(resolveHref(step, { demoClientId: 'a b' })).toBe('/coach/movement/a%20b')
    })

    it('el paso 3 llega a RN marcado como entrada guiada (?primera=1) y la web NO cambia', () => {
        for (const persona of PERSONAS) {
            const step = ONBOARDING_STEPS[persona][2]
            expect({ persona, marked: (step.rnRoute ?? '').includes(RN_FIRST_STEP_QUERY) }).toEqual({
                persona,
                marked: true,
            })
            // La web resuelve el template-first con su propio vacío: su href no lleva la marca.
            expect(step.webHref ?? '').not.toContain(RN_FIRST_STEP_PARAM)
        }
    })

    it('resolveRnRoute conserva la marca al resolver el demo', () => {
        const resolved = resolveRnRoute(ONBOARDING_STEPS.nutrition[2], { demoClientId: 'demo-1' })
        expect(resolved).toBe(`/coach/nutrition-v2/editor/demo-1${RN_FIRST_STEP_QUERY}`)
        expect(resolveRnRoute(ONBOARDING_STEPS.strength[2], { demoClientId: null })).toBe(
            `/coach/(tabs)/builder${RN_FIRST_STEP_QUERY}`,
        )
    })

    it('ningún paso que NO sea el 3 arrastra la marca de entrada guiada', () => {
        for (const persona of PERSONAS) {
            ONBOARDING_STEPS[persona].forEach((step, index) => {
                if (index === 2) return
                expect(step.rnRoute ?? '').not.toContain(RN_FIRST_STEP_PARAM)
            })
        }
    })

    it('el demo vacío se trata como ausente', () => {
        const step = ONBOARDING_STEPS.nutrition[2]
        expect(resolveHref(step, { demoClientId: '' })).toBeNull()
        expect(resolveRnRoute(step, { demoClientId: '' })).toBeNull()
    })
})

describe('@eva/onboarding — auto-completado, próximo paso y progreso', () => {
    it('sin señales: nada tildado', () => {
        expect(resolveAutoCompleted(NO_SIGNALS)).toEqual(NONE_DONE)
    })

    it('matriz: cada señal tilda SOLO su paso', () => {
        const cases: Array<[Partial<OnboardingSignals>, OnboardingStepKey]> = [
            [{ hasBrand: true }, 'profile_branding'],
            [{ viveTuAppOpened: true }, 'vive_tu_app'],
            [{ hasFirstArtifact: true }, 'first_artifact'],
            [{ realClients: 1 }, 'first_client'],
            [{ realStudentActivity: true }, 'aha'],
        ]
        for (const [patch, expected] of cases) {
            const done = resolveAutoCompleted({ ...NO_SIGNALS, ...patch })
            for (const key of ONBOARDING_STEP_KEYS) {
                expect({ key, done: done[key] }).toEqual({ key, done: key === expected })
            }
        }
    })

    it('el alumno demo NO tilda «invitá a tu primer alumno» (realClients ya viene sin demos)', () => {
        expect(resolveAutoCompleted({ ...NO_SIGNALS, realClients: 0 }).first_client).toBe(false)
        expect(resolveAutoCompleted({ ...NO_SIGNALS, realClients: 2 }).first_client).toBe(true)
    })

    it('todas las señales: 5/5', () => {
        const done = resolveAutoCompleted({
            hasBrand: true,
            viveTuAppOpened: true,
            hasFirstArtifact: true,
            realClients: 3,
            realStudentActivity: true,
        })
        expect(done).toEqual(ALL_DONE)
        expect(progress(done)).toEqual({ done: 5, total: 5 })
        expect(isOnboardingComplete(done)).toBe(true)
    })

    it('nextStep: el primero sin tildar, en el orden de la guía', () => {
        for (const persona of PERSONAS) {
            expect(nextStep(persona, NONE_DONE)?.key).toBe('profile_branding')
            expect(nextStep(persona, { ...NONE_DONE, profile_branding: true })?.key).toBe('vive_tu_app')
            expect(nextStep(persona, ALL_DONE)).toBeNull()
        }
    })

    it('nextStep: un paso tildado más abajo no adelanta a uno pendiente', () => {
        const done = { ...NONE_DONE, first_client: true, aha: true }
        expect(nextStep('strength', done)?.key).toBe('profile_branding')
    })

    it('nextStep devuelve el paso de LA persona (paso 3 distinto por rama)', () => {
        const done = { ...NONE_DONE, profile_branding: true, vive_tu_app: true }
        expect(nextStep('nutrition', done)?.label).toBe('Arma la pauta de Ana desde una plantilla')
        expect(nextStep('endurance', done)?.label).toBe('Revisa las zonas de Javiera y su semana base')
    })

    it('progress cuenta 0..5 y el total es fijo', () => {
        expect(progress(NONE_DONE)).toEqual({ done: 0, total: 5 })
        expect(progress({ ...NONE_DONE, profile_branding: true })).toEqual({ done: 1, total: 5 })
        expect(isOnboardingComplete(NONE_DONE)).toBe(false)
    })
})

describe('@eva/onboarding — demos y plantillas', () => {
    it('los demos coinciden con el copy de @eva/schemas (nombre y bajada)', () => {
        for (const persona of PERSONAS) {
            const profile = DEMO_PROFILES[persona]
            const copy = PERSONA_COPY[persona]
            if (copy.demoName == null) {
                expect(profile).toBeNull()
                continue
            }
            expect(profile?.name).toBe(copy.demoName)
            expect(profile?.tagline).toBe(copy.demoTagline)
        }
    })

    it('el intake del demo usa las columnas reales de client_intake y valores plausibles', () => {
        for (const persona of PERSONAS) {
            const profile = DEMO_PROFILES[persona]
            if (profile == null) continue
            expect(Object.keys(profile.intake).every((k) =>
                ['weight_kg', 'height_cm', 'experience_level', 'availability', 'goals', 'injuries', 'medical_conditions'].includes(k),
            )).toBe(true)
            expect(profile.intake.weight_kg).toBeGreaterThan(30)
            expect(profile.intake.height_cm).toBeGreaterThan(120)
            expect(profile.intake.goals.trim().length).toBeGreaterThan(0)
            expect(profile.intake.availability.trim().length).toBeGreaterThan(0)
            expect(profile.age).toBeGreaterThan(0)
            expect(['male', 'female']).toContain(profile.sex)
        }
    })

    it('solo endurance trae perfil de cardio (de ahí salen las zonas)', () => {
        for (const persona of PERSONAS) {
            const profile = DEMO_PROFILES[persona]
            if (persona === 'endurance') {
                expect(profile?.cardio).toEqual({ resting_hr: 58, ref_5k_time_sec: 1500 })
                continue
            }
            expect(profile?.cardio).toBeUndefined()
        }
    })

    it('rehab trae la historia clínica mínima (lesión + contexto)', () => {
        expect(DEMO_PROFILES.rehab?.intake.injuries).toBeTruthy()
        expect(DEMO_PROFILES.rehab?.intake.medical_conditions).toBeTruthy()
    })

    it('plantillas: ids únicos, label y blurb no vacíos; `other` va vacío a propósito', () => {
        const seen = new Set<string>()
        for (const persona of PERSONAS) {
            const templates = TEMPLATE_CATALOG[persona]
            if (persona === 'other') {
                expect(templates).toHaveLength(0)
                continue
            }
            expect(templates.length).toBeGreaterThan(0)
            for (const template of templates) {
                expect(template.id).toMatch(/^[a-z0-9-]+$/)
                expect(seen.has(template.id)).toBe(false)
                seen.add(template.id)
                expect(template.label.trim().length).toBeGreaterThan(0)
                expect(template.blurb.trim().length).toBeGreaterThan(0)
            }
        }
    })

    it('las ramas con demo tienen plantillas (nadie ve un builder en blanco)', () => {
        for (const persona of PERSONAS) {
            if (DEMO_PROFILES[persona] == null) continue
            expect(TEMPLATE_CATALOG[persona].length).toBeGreaterThan(0)
        }
    })

    it('cubre las 5 personas del contrato (sin ramas huérfanas)', () => {
        const personas: Persona[] = [...PERSONAS]
        expect(Object.keys(ONBOARDING_STEPS).sort()).toEqual([...personas].sort())
        expect(Object.keys(DEMO_PROFILES).sort()).toEqual([...personas].sort())
        expect(Object.keys(TEMPLATE_CATALOG).sort()).toEqual([...personas].sort())
    })
})
