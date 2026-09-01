import type { Persona } from '@eva/schemas'
import { coachWorkspaceTypeFromKind, getVisibleNavItems, type NavModule } from '@eva/coach-nav'
import { PERSONA_DOMAIN_ORDER, type FeatureDomain } from '@eva/feature-prefs'
import { getCachedCoachPersonaStatus } from './coach-persona'
import { useEntitlements } from './entitlements'
import { disabledDomainsFromFlags } from './entitlements-core'
import { useWorkspace } from './workspace'

/**
 * Estado compartido del nav del coach en RN (Ola de orden W2.5/W2.6).
 *
 * Existe porque la BARRA (`CoachMobileChrome`) y la HOJA «Mas» (`app/coach/(tabs)/more.tsx`) tienen
 * que ver EXACTAMENTE lo mismo: la hoja lista el `overflow` de la misma llamada a `buildMobileBar`
 * que arma la barra. Si cada superficie juntara sus inputs por su cuenta, un dominio apagado —o un
 * workspace recien cambiado— podria desaparecer de la barra y no aparecer en la hoja (o al reves),
 * que es justo el agujero por el que se caia «Equipo» antes de W2.5.
 *
 * Solo REUNE los hooks que ya usaba la barra (`useWorkspace` + `useEntitlements`) y la lectura
 * sincronica de la persona; no decide nada de visibilidad por su cuenta.
 */
export type CoachNavState = {
    /** Items del registro visibles para el contexto/status/dominios de HOY. */
    visible: NavModule[]
    /** Especialidad del coach; `null` = coach anterior al onboarding v2 o gate sin resolver. */
    persona: Persona | null
    /** Prioridad de dominios a usar con `buildMobileBar`. Con persona `null` cae en `other`. */
    domainOrder: readonly FeatureDomain[]
    /** Status bloqueado: el unico item visible es «Reactivar» (la capsula pinta su barra propia). */
    blocked: boolean
}

export function useCoachNavState(): CoachNavState {
    const { kind, subscriptionState } = useWorkspace()
    const { hasModule, domains } = useEntitlements()

    const visible = getVisibleNavItems({
        activeWorkspaceType: coachWorkspaceTypeFromKind(kind),
        subscriptionStatus: subscriptionState,
        enabledModules: {
            cardio: hasModule('cardio'),
            movement_assessment: hasModule('movement_assessment'),
        },
        // Los 5 dominios de feature-prefs, no solo nutricion: paridad exacta con el
        // `disabledDomainsFromPrefs` del nav web (misma fuente, misma regla fail-open).
        // `bodycomp` no tiene entrada en NAV_MODULES => viaja igual y es inocuo.
        disabledDomains: disabledDomainsFromFlags(domains),
    })

    // Lectura SINCRONICA de la cache del gate de persona (`resolveCoachPersonaGate` ya corrio antes
    // de llegar al chrome del coach). `null` mientras carga o si el coach nunca contesto => orden
    // `other`, el mismo fallback que usa W2.1 para persona desconocida. Cuando el gate resuelve, el
    // arbol del coach se re-monta y la barra se rearma sola: no hace falta un listener nuevo.
    const persona = getCachedCoachPersonaStatus()?.persona ?? null

    return {
        visible,
        persona,
        domainOrder: PERSONA_DOMAIN_ORDER[persona ?? 'other'],
        blocked: visible.length === 1 && visible[0]?.key === 'reactivate',
    }
}
