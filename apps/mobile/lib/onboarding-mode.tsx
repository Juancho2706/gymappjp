import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { isGuideActive } from '@eva/onboarding'
import { useCoachOnboarding, type MobileOnboardingV2 } from './coach-dashboard'
import { useWorkspace } from './workspace'

/**
 * Modo de onboarding del panel del coach — «¿la guía v2 está mandando en esta área?».
 *
 * Decisión del owner (2026-08-22): **no podemos tener varios onboardings en una sola área**.
 * Mientras la guía v2 está ACTIVA (ni completa, ni descartada, ni oculta, y el coach es
 * standalone), ningún tour ni modal de módulo se dispara solo: la guía ES la bienvenida y el
 * resto queda a pedido (el «?» de cada superficie sigue abriendo su tour cuando el coach lo pide,
 * y ese camino manual no marca nada como visto).
 *
 * La condición NO se deriva acá: vive en `@eva/onboarding` (`isGuideActive`), el mismo dato puro
 * que consume la web, para que las dos superficies no la interpreten cada una por su lado.
 *
 * Datos: NO consulta nada. Lee la foto que publican el dashboard y la guía en el store de
 * `lib/coach-dashboard` (el mismo que alimenta a `components/coach/GuidePill.tsx`). Sin foto —
 * nadie cargó el panel todavía en esta sesión— el modo degrada a `guideActive: false`: se prefiere
 * un tour de más en un caso raro antes que apagar para siempre los tours de un coach por una
 * consulta que nunca llegó.
 */

export interface OnboardingMode {
  /** `true` = la guía v2 manda: nada auto-arranca en esta área. */
  guideActive: boolean
}

/** Fuera del provider (o sin foto del panel) el panel se comporta como siempre. */
const DEFAULT_MODE: OnboardingMode = { guideActive: false }

const OnboardingModeContext = createContext<OnboardingMode>(DEFAULT_MODE)

/** Resolver PURO del modo. Separado del provider para poder probarlo sin montar React Native. */
export function resolveOnboardingMode(input: {
  onboardingV2: MobileOnboardingV2 | null
  /** Coach de org/team: su panel lo define el tenant, no tiene guía propia. */
  managed: boolean
}): OnboardingMode {
  if (input.onboardingV2 == null) return DEFAULT_MODE
  const { completed, dismissed, hidden } = input.onboardingV2.guide
  return { guideActive: isGuideActive({ completed, dismissed, hidden, managed: input.managed }) }
}

/**
 * Predicado del auto-arranque de un tour. Un solo lugar para la regla, así ninguna superficie
 * inventa su propia versión de «pero si la guía está activa, no».
 */
export function tourAutoStartEligible(input: { autoStart: boolean; guideActive: boolean }): boolean {
  return input.autoStart === true && input.guideActive !== true
}

/**
 * Provider del modo. Se monta UNA vez, en el layout raíz del árbol coach (`app/coach/_layout.tsx`),
 * para que cualquier módulo pueda preguntarle sin volver a pedir datos.
 */
export function OnboardingModeProvider({ children }: { children: ReactNode }) {
  const snapshot = useCoachOnboarding()
  const workspace = useWorkspace()
  // Espejo del `managed` de la web (`coach/layout.tsx`: `!isStandalone || personaContext.managed`).
  const managed = workspace.kind !== 'standalone' || workspace.isManaged === true
  const onboardingV2 = snapshot?.onboardingV2 ?? null
  const value = useMemo(
    () => resolveOnboardingMode({ onboardingV2, managed }),
    [onboardingV2, managed],
  )
  return <OnboardingModeContext.Provider value={value}>{children}</OnboardingModeContext.Provider>
}

/** Modo vigente. Sin provider devuelve el default (nada gateado). */
export function useOnboardingMode(): OnboardingMode {
  return useContext(OnboardingModeContext)
}
