import { ONBOARDING_STEPS, nextStep, type OnboardingStepKey } from '@eva/onboarding'
import type { Persona } from '@eva/schemas'

/**
 * Foco de «Tus primeros pasos» — la parte PURA de la guía de RN (`app/coach/guia.tsx`).
 *
 * Hallazgo 1 del QA del owner (2026-08-22, Android): «elegí persona, me arma las cosas y me
 * devuelve al INICIO de la guía, no me lleva al siguiente paso». La pantalla siempre aterrizaba
 * arriba del todo, así que un coach que ya tenía pasos tildados veía primero lo que YA hizo y
 * tenía que buscar a mano dónde seguir.
 *
 * Acá vive el «cuál es la tarjeta que manda» y el «hay que desplazarse hasta ella», separado de la
 * pantalla para poder pinnearlo en `tests/mobile/guia-focus.test.ts` sin montar el árbol nativo.
 * La regla de negocio (el siguiente paso = el primero sin tildar) NO se reimplementa: sale de
 * `nextStep` de `@eva/onboarding`, el mismo que usan la píldora y la web.
 */

/** La tarjeta que manda: cuál es, cómo se llama y en qué posición de la lista quedó. */
export type GuideFocus = {
    key: OnboardingStepKey
    /** Etiqueta del paso, tal cual la pinta la tarjeta («Empezar: {label}» en la banda). */
    label: string
    /** Índice 0-based dentro de `ONBOARDING_STEPS[persona]`. */
    index: number
}

/**
 * El paso «siguiente»: el primero sin tildar de la persona del coach.
 *
 * Sin persona no hay foco: a ese coach la guía no le propone un paso, le propone elegir
 * especialidad (mismo criterio que `GuidePill`). Con los cinco tildados tampoco: ahí manda la
 * tarjeta de cierre.
 */
export function resolveGuideFocus(input: {
    persona: Persona | null
    completed: Record<OnboardingStepKey, boolean>
}): GuideFocus | null {
    const { persona, completed } = input
    if (persona == null) return null
    const step = nextStep(persona, completed)
    if (step == null) return null
    const index = ONBOARDING_STEPS[persona].findIndex((candidate) => candidate.key === step.key)
    if (index < 0) return null
    return { key: step.key, label: step.label, index }
}

/**
 * ¿La pantalla se desplaza sola hasta el foco?
 *
 * Solo cuando los datos ya están (`ready`) y el paso siguiente NO es el primero. Si el foco es el
 * paso 1 la lista ya arranca en él, y desplazarse igual le taparía al coach recién llegado la
 * banda de bienvenida y la cabecera con el progreso — justo lo que tiene que leer.
 *
 * El botón de la banda («Empezar: …») no pasa por acá: ese es un dedo del coach, y un dedo siempre
 * manda.
 */
export function shouldAutoScrollToFocus(
    focus: GuideFocus | null,
    input: { ready: boolean },
): boolean {
    if (!input.ready || focus == null) return false
    return focus.index > 0
}

/**
 * Y (en px) al que se desplaza la lista. `cardY` viene relativo al contenedor de las tarjetas y
 * `containerY` al contenido del ScrollView, así que se suman; el `gap` deja aire arriba para que
 * la tarjeta no quede pegada al borde. Nunca negativo: `scrollTo` con y<0 rebota en iOS.
 */
export function focusScrollY(input: { containerY: number; cardY: number; gap?: number }): number {
    const gap = input.gap ?? 12
    return Math.max(0, input.containerY + input.cardY - gap)
}
