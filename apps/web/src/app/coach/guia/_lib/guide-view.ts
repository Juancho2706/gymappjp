import type { OnboardingStep, OnboardingStepKey } from '@eva/onboarding'
import { PERSONA_COPY, type Persona } from '@eva/schemas'

/**
 * Helpers PUROS de la pantalla `/coach/guia` — lo que se puede decidir sin React.
 *
 * Viven separados del componente para poder probar el estado de cada tarjeta y el copy de la
 * banda de bienvenida sin montar el árbol (que arrastra server actions, QR y confeti).
 */

/** Estado visual de una tarjeta de paso. */
export type GuideStepState = 'done' | 'next' | 'pending'

export interface GuideStepView {
    step: OnboardingStep
    /** Posición 1-based: se pinta en la tarjeta y en el `aria-label`. */
    position: number
    state: GuideStepState
}

/**
 * Estado de los 5 pasos: los tildados van `done`, el PRIMERO sin tildar es `next` (el único
 * destacado) y el resto `pending`. Mismo criterio que `nextStep` de `@eva/onboarding` —el orden
 * es el del trabajo real, no el del progreso—, pero devolviendo la lista completa de una pasada.
 */
export function resolveStepViews(
    steps: readonly OnboardingStep[],
    completed: Record<OnboardingStepKey, boolean>,
): GuideStepView[] {
    let nextTaken = false
    return steps.map((step, index) => {
        const done = completed[step.key] === true
        let state: GuideStepState = 'pending'
        if (done) {
            state = 'done'
        } else if (!nextTaken) {
            state = 'next'
            nextTaken = true
        }
        return { step, position: index + 1, state }
    })
}

/**
 * Ancla DOM de la tarjeta de un paso. Es el contrato entre la banda de bienvenida (que manda el
 * foco al paso siguiente) y la lista de tarjetas: vive acá, en el módulo puro, para que las dos
 * puntas no puedan desincronizarse con un template string suelto.
 *
 * Hallazgo 1 del QA del owner (22-08): elegir persona devolvía al coach al INICIO de la guía en
 * vez de dejarlo parado en el paso que sigue.
 */
export function stepAnchorId(key: OnboardingStepKey): string {
    return `paso-${key}`
}

/**
 * Paso 3 («Arma tu primer …») en modo GUIADO: el destino recibe `?primera=1` y ahí decide qué
 * mostrar — tarjetas embebidas, plantilla de arranque, aviso de «ya tiene una pauta» (W4 F4.3).
 *
 * El query param se agrega ACÁ y no en `@eva/onboarding` porque el paquete es la fuente compartida
 * con RN, donde la ruta se resuelve distinto; y la decisión real (plan vigente vs nuevo, screening
 * existente vs nuevo, perfil completo vs incompleto) es server-side, así que al link le alcanza con
 * decir «vengo de la guía».
 */
export function withPrimeraFlag(href: string | null): string | null {
    if (href == null) return null
    if (href.includes('primera=')) return href
    return href + (href.includes('?') ? '&' : '?') + 'primera=1'
}

/**
 * Banda de bienvenida (`?bienvenida=1`): DOS líneas, sin modal. Reemplaza al modal de bienvenida
 * en el primer ingreso — la guía ya es la bienvenida (SPEC §6: «modal de bienvenida solo texto»,
 * y acá directamente ni modal).
 *
 * La segunda línea es la que cambia por persona: nombra el alumno de ejemplo de SU mundo, que es
 * lo que hace que el panel no se sienta vacío.
 */
export function welcomeLines(persona: Persona | null, firstName: string): [string, string] {
    const greeting = `Te damos la bienvenida, ${firstName}.`

    if (persona == null) {
        return [
            greeting,
            'Elige tu especialidad cuando quieras y ordenamos el panel a tu medida. Mientras tanto, estos cinco pasos te dejan andando hoy.',
        ]
    }

    const copy = PERSONA_COPY[persona]
    if (copy.demoName == null) {
        return [greeting, 'Te dejamos el panel completo. Estos cinco pasos te dejan andando hoy.']
    }

    return [
        greeting,
        `Tu panel quedó armado a tu medida y te dejamos a ${copy.demoName}, tu ${copy.noun.singular} de ejemplo, para que pruebes sin gastar cupo.`,
    ]
}

/**
 * Etiqueta corta de la persona para el chip de la cabecera. Los `tileTitle` de `PERSONA_COPY` son
 * frases completas («Entreno fuerza y acondicionamiento»): sirven para elegir en la pantalla de
 * persona, no para un chip de una línea al lado del título.
 */
export const PERSONA_CHIP_LABEL: Record<Persona, string> = {
    strength: 'Fuerza y acondicionamiento',
    nutrition: 'Nutrición',
    rehab: 'Rehabilitación',
    endurance: 'Resistencia',
    other: 'Panel completo',
}
