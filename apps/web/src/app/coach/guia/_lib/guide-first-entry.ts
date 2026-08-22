import { ONBOARDING_STEP_KEYS, ONBOARDING_TOTAL_STEPS, type OnboardingStepKey } from '@eva/onboarding'

/**
 * Primera entrada y visibilidad de la guía — resolvers PUROS (sin React, sin Supabase, sin Next).
 *
 * Cambio del 22-08 (decisión del owner, manda sobre SPEC §Diseño v2 «guía arriba del dashboard»):
 * el dashboard del día 1 se ve LLENO y la guía se muda a su PANTALLA PROPIA `/coach/guia`. De ahí
 * salen las dos decisiones que viven acá:
 *
 *  1. `shouldRedirectToGuide` — TODO coach standalone, sea Free, Pro o Elite, ve la guía en su
 *     PRIMERA entrada al panel, no el dashboard. Una sola vez: la propia pantalla estampa
 *     `onboarding_guide.guide_seen_at` al montarse y a partir de ahí el dashboard abre normal.
 *  2. `shouldShowGuidePill` — la píldora flotante que reemplaza a la guía dentro del dashboard.
 *
 * Son gemelas del gate de persona (`services/coach/persona.service.ts`, `shouldRedirectToPersona`):
 * mismo patrón (resolver puro + decisión tomada donde se conoce la ruta), distinto momento. El de
 * persona corre en `proxy.ts` porque intercepta TODO `/coach/*`; este corre en el RSC de
 * `/coach/dashboard`, que es la única ruta que redirige, así que no necesita el proxy.
 *
 * Módulo PURO a propósito: lo consumen un RSC (`coach/dashboard/page.tsx`), un client component
 * (`components/coach/GuidePill.tsx`) y sus tests, sin arrastrar nada de servidor a ninguno.
 */

/** Ruta de la guía. Una sola definición para el redirect, la píldora y los links. */
export const GUIDE_ROUTE = '/coach/guia'

/**
 * Clave del jsonb `coaches.onboarding_guide` con el instante en que el coach vio la guía por
 * primera vez. Es lo que hace que el redirect de primera entrada ocurra UNA sola vez.
 */
export const GUIDE_SEEN_AT_KEY = 'guide_seen_at'

/** Rutas donde la píldora NO se pinta. */
const PILL_HIDDEN_PREFIXES = [
    // La guía misma: la píldora sería un botón hacia donde ya estás.
    GUIDE_ROUTE,
    // «¿A qué te dedicas?» y el alta por OAuth: pantallas completas de primer ingreso.
    '/coach/onboarding',
    // Builders full-screen: la cápsula de navegación tampoco se pinta ahí (CoachSidebar
    // `isBuilder`), así que la píldora quedaría flotando sola sobre un lienzo denso de trabajo.
    '/coach/builder',
    '/coach/workout-programs/builder',
] as const

/** Estado persistido de la guía que le importa a estos resolvers. */
export interface GuideProgressState {
    /** Pasos tildados y PERSISTIDOS (`onboarding_guide.completed`). */
    completed: Partial<Record<OnboardingStepKey, boolean>>
    /** El coach mandó la guía al pie / la descartó. */
    dismissed: boolean
    /** El coach la apagó del todo. */
    hidden: boolean
    /** Instante ISO de la primera visita a `/coach/guia`. `null` = todavía no la vio. */
    guideSeenAt: string | null
}

/** Pasos tildados en el estado PERSISTIDO (el hook de la guía persiste los auto-completados). */
export function persistedDone(completed: GuideProgressState['completed']): number {
    let done = 0
    for (const key of ONBOARDING_STEP_KEYS) {
        if (completed[key] === true) done += 1
    }
    return done
}

/** ¿La guía ya está en 5/5 según lo persistido? */
export function isGuidePersistedComplete(completed: GuideProgressState['completed']): boolean {
    return persistedDone(completed) >= ONBOARDING_TOTAL_STEPS
}

/** ¿El coach apagó la guía (la descartó o la ocultó)? */
function isGuideOff(guide: GuideProgressState): boolean {
    return guide.dismissed === true || guide.hidden === true
}

export interface GuideFirstEntryInput {
    /** `coaches.persona`. `null` = todavía no eligió especialidad. */
    persona: string | null
    guide: GuideProgressState
    /** Coach administrado por una org o un team: su panel lo define el tenant. */
    managed: boolean
}

/**
 * ¿Este request al dashboard tiene que ir a la guía?
 *
 * `!managed && persona elegida && guía ni completa ni descartada && sin guide_seen_at`.
 *
 * Notas de las dos ramas que NO redirigen aunque parezcan candidatas:
 *  - **Persona `null`** (coach viejo, con alumnos, que nunca contestó «¿A qué te dedicas?»): no se
 *    lo secuestra. La píldora lo invita, y la tarjeta de especialidad vive dentro de la guía.
 *  - **Managed** (org/team): nunca. Su panel no es suyo.
 */
export function shouldRedirectToGuide(input: GuideFirstEntryInput): boolean {
    if (input.managed) return false
    if (input.persona == null || input.persona === '') return false
    if (isGuideOff(input.guide)) return false
    if (isGuidePersistedComplete(input.guide.completed)) return false
    return input.guide.guideSeenAt == null || input.guide.guideSeenAt === ''
}

export interface GuidePillVisibilityInput extends GuideFirstEntryInput {
    /** Ruta que se está pintando. */
    pathname: string
}

/**
 * ¿Se pinta la píldora flotante en esta ruta?
 *
 * A diferencia del redirect, acá la persona `null` SÍ la muestra: es justamente el coach al que
 * hay que invitar a elegir especialidad (la píldora ofrece «Elige tu especialidad» como siguiente
 * paso). Lo que la apaga es haber terminado la guía, haberla descartado, ser managed o estar
 * parado en una pantalla donde estorba.
 */
export function shouldShowGuidePill(input: GuidePillVisibilityInput): boolean {
    if (input.managed) return false
    if (isGuideOff(input.guide)) return false
    if (isGuidePersistedComplete(input.guide.completed)) return false
    return !PILL_HIDDEN_PREFIXES.some(
        (prefix) => input.pathname === prefix || input.pathname.startsWith(prefix + '/'),
    )
}
