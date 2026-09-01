import type { FeatureDomain } from '@eva/feature-prefs'

/** Identidad estable de cada acción rápida; la UI mapea el id a su ícono y a su handler. */
export type QuickActionId = 'create_client' | 'import' | 'program'

export type QuickAction = {
    id: QuickActionId
    label: string
    /** Dominio que la gobierna. Sin dominio ⇒ la acción nunca se oculta. */
    domain?: FeatureDomain
}

/**
 * Dominios prendidos tal como los devuelve `resolveDomainsEnabled` (el `Record` completo es
 * asignable). Se acepta parcial a propósito: una key ausente es fail-OPEN.
 */
export type DomainsEnabled = Partial<Record<FeatureDomain, boolean>>

/** Catálogo en el orden del diseño (coach-dashboard.jsx → FAB + bottom sheet). */
const QUICK_ACTIONS: readonly QuickAction[] = [
    { id: 'create_client', label: 'Crear alumno' },
    { id: 'import', label: 'Importar' },
    { id: 'program', label: 'Programa', domain: 'training' },
]

/**
 * Acciones rápidas visibles para estos dominios (Ola de orden W2.7). Es el paralelo del gate de
 * ruta W1.4a: el FAB no ofrece un atajo a una ruta que `assertDomainEnabled` va a redirigir —
 * «Programa» apunta a `/coach/workout-programs`, que con `training` apagado devuelve al panel.
 *
 * Fail-OPEN: solo el `false` explícito apaga una acción. Sin dominios resueltos (default `{}`,
 * o un dominio ausente del mapa) se muestra todo: visibilidad, nunca autorización.
 */
export function dashboardQuickActions(domainsEnabled: DomainsEnabled = {}): readonly QuickAction[] {
    return QUICK_ACTIONS.filter(
        (action) => action.domain == null || domainsEnabled[action.domain] !== false
    )
}
