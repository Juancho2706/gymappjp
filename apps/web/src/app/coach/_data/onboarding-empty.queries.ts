import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { PERSONA_COPY, PersonaSchema, personaNoun, type Persona } from '@eva/schemas'
import { TEMPLATE_CATALOG, type OnboardingTemplate } from '@eva/onboarding'
import { getDemoClientId } from '@/services/onboarding/demo-student.service'

/**
 * Contexto de los estados vacíos «template-first» del coach nuevo
 * (docs/specs/coach-onboarding-v2/SPEC.md §7, TASKS F3.6/F3.7).
 *
 * Una sola lectura por REQUEST (`React.cache`) para las cuatro superficies con vacío
 * (programas/builder, nutrición V2, movimiento, cardio) y para el directorio/ficha del alumno:
 * `coaches.persona` no vive en `getCoach()` (su repository no la selecciona) y `is_demo` no
 * viaja en los read models de cardio/movimiento/nutrición. Con este helper cada página resuelve
 * ambas cosas con 2 queries memoizadas — nunca una por fila (nada de N+1).
 */
export interface CoachOnboardingEmptyContext {
    /** Coach autenticado; `null` si no hay sesión (la página ya redirige en ese caso). */
    coachId: string | null
    /** Persona elegida en «¿A qué te dedicas?». `null` = todavía no la eligió. */
    persona: Persona | null
    /** Persona con la que se resuelven copy y vocabulario: `strength` mientras no elija. */
    effectivePersona: Persona
    /** Alumno de ejemplo sembrado en el alta (`clients.is_demo`). `null` = no hay o lo borró. */
    demoClientId: string | null
    /** Nombre del alumno de ejemplo de la rama (Matías / Ana / Pedro / Javiera). */
    demoName: string | null
    /** Etiqueta visible: «Alumno de ejemplo» · «Paciente de ejemplo» · «Atleta de ejemplo». */
    demoLabel: string
    /** Sustantivo de la persona en singular («alumno» / «paciente» / «atleta»). */
    noun: string
}

/** Superficie que pide plantillas: cada una necesita las de SU dominio, no las de la persona. */
export type TemplateSurface = 'training' | 'nutrition' | 'movement' | 'cardio'

/**
 * Plantillas que corresponden a una superficie.
 *
 * El catálogo de `@eva/onboarding` está indexado por PERSONA, pero una superficie tiene un
 * dominio fijo: la pauta de nutrición de un coach de fuerza sigue siendo una pauta, no una
 * rutina. Solo entrenamiento sigue a la persona (rutinas de fuerza, pauta domiciliaria de
 * rehab, semanas de running); nutrición, movimiento y cardio salen siempre de su rama.
 *
 * `other` (y `persona` sin elegir) cae a `strength` en entrenamiento: el panel completo no
 * tiene «mundo» propio y un vacío sin ninguna acción sería peor que una plantilla genérica.
 */
export function templatesForSurface(
    surface: TemplateSurface,
    persona: Persona | null,
): readonly OnboardingTemplate[] {
    if (surface === 'nutrition') return TEMPLATE_CATALOG.nutrition
    if (surface === 'movement') return TEMPLATE_CATALOG.rehab
    if (surface === 'cardio') return TEMPLATE_CATALOG.endurance
    const trainingPersona: Persona =
        persona === 'rehab' || persona === 'endurance' || persona === 'strength' ? persona : 'strength'
    return TEMPLATE_CATALOG[trainingPersona]
}

/** «Alumno de ejemplo» a partir del sustantivo de la persona (mayúscula inicial). */
export function demoLabelFor(persona: Persona): string {
    const noun = personaNoun(persona)
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} de ejemplo`
}

const EMPTY_CONTEXT: CoachOnboardingEmptyContext = {
    coachId: null,
    persona: null,
    effectivePersona: 'strength',
    demoClientId: null,
    demoName: null,
    demoLabel: demoLabelFor('strength'),
    noun: personaNoun('strength'),
}

/**
 * Persona + alumno de ejemplo del coach autenticado. Memoizado por request: las páginas que ya
 * llaman a `getCoach()` lo invocan además de su query existente, sin duplicar round-trips entre
 * layout y page.
 *
 * Lectura user-scoped (RLS): `coaches` solo devuelve la fila propia y `getDemoClientId` filtra
 * por `coach_id` + `is_demo`. Nada de service_role acá.
 */
export const getCoachOnboardingEmptyContext = cache(
    async (): Promise<CoachOnboardingEmptyContext> => {
        const supabase = await createClient()
        // getClaims(): verificación LOCAL del JWT (ES256). Es lectura de página, no boundary
        // de mutación (el proxy ya validó la sesión).
        const { data: claims } = await supabase.auth.getClaims()
        const coachId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null
        if (!coachId) return EMPTY_CONTEXT

        const [personaRow, demoClientId] = await Promise.all([
            supabase.from('coaches').select('persona').eq('id', coachId).maybeSingle(),
            getDemoClientId(supabase, coachId),
        ])

        const parsed = PersonaSchema.safeParse(personaRow.data?.persona)
        const persona = parsed.success ? parsed.data : null
        const effectivePersona: Persona = persona ?? 'strength'

        return {
            coachId,
            persona,
            effectivePersona,
            demoClientId,
            // El nombre lo fija el contrato del seed (`PERSONA_COPY[persona].demoName`), así que
            // no cuesta una query extra. Sin demo sembrado no hay nombre que mostrar.
            demoName: demoClientId ? PERSONA_COPY[effectivePersona].demoName : null,
            demoLabel: demoLabelFor(effectivePersona),
            noun: personaNoun(effectivePersona),
        }
    },
)
