import type { FeatureDomain } from '@eva/feature-prefs'

/**
 * Catálogo de pestañas de la ficha del alumno + su gobierno por los DOMINIOS prendidos del
 * panel del coach (Ola de orden W1.8, decisión 4A del owner).
 *
 * REGLA 4A: si un dominio está apagado, su pestaña NO se muestra; si esa pestaña era la
 * activa, la ficha cae a «Resumen». `overview` y `progress` no dependen de ningún dominio:
 * NUNCA se ocultan (si no, un coach con todo apagado se quedaría con una ficha vacía).
 *
 * EL OVERRIDE POR-ALUMNO NO OCULTA PESTAÑAS: `client_feature_prefs` es justamente la puerta
 * para volver a prender un dominio en un alumno puntual, así que quien resuelve `domains`
 * para esta superficie NO pasa `clientId` al resolver.
 *
 * FAIL-OPEN: solo el `false` explícito oculta. Dominio ausente / `undefined` / lectura que
 * falló ⇒ la pestaña se muestra.
 *
 * ESTO ES VISIBILIDAD, NUNCA AUTORIZACIÓN: esconder una pestaña no le saca permisos a nadie;
 * RLS y los entitlements server-side quedan intactos.
 *
 * Módulo PURO (sin React) para poder testearlo sin montar la ficha entera.
 */

/**
 * 5 pestañas (sin Facturación). Etiquetas 1:1 con el diseño nuevo: Resumen · Progreso ·
 * Entreno · Programa · Nutrición. Pills label-only (sin íconos), como en coach-ficha.jsx.
 */
export const PROFILE_TABS = [
    { id: 'overview', label: 'Resumen' },
    { id: 'progress', label: 'Progreso' },
    { id: 'workout', label: 'Entreno' },
    { id: 'program', label: 'Programa' },
    { id: 'nutrition', label: 'Nutrición' },
] as const

export type ProfileTab = (typeof PROFILE_TABS)[number]

export type ProfileMainTabId = ProfileTab['id']

/**
 * Mapa pestaña → dominio que la gobierna. Las pestañas ausentes (`overview`, `progress`) no
 * dependen de ningún dominio y nunca se ocultan.
 */
export const TAB_DOMAIN: Partial<Record<ProfileMainTabId, FeatureDomain>> = {
    workout: 'training',
    program: 'training',
    nutrition: 'nutrition',
}

/**
 * Dominios prendidos tal como los devuelve `resolveDomainsEnabled` (el `Record` completo es
 * asignable). Se acepta parcial a propósito: una key ausente es fail-OPEN.
 */
export type DomainsEnabled = Partial<Record<FeatureDomain, boolean>>

/** Pestañas visibles para estos dominios, en el orden del catálogo. */
export function visibleProfileTabs(domains: DomainsEnabled): readonly ProfileTab[] {
    return PROFILE_TABS.filter((tab) => {
        const domain = TAB_DOMAIN[tab.id]
        // Sin dominio => siempre visible. Con dominio => solo el `false` explícito oculta.
        return domain == null || domains[domain] !== false
    })
}

/**
 * Pestaña que se debe RENDERIZAR: la activa si sigue visible, si no `'overview'` (4A). Evita
 * que una pestaña cuyo dominio se apagó quede pintando un panel sin acceso a su menú.
 */
export function resolveActiveProfileTab(
    active: ProfileMainTabId,
    domains: DomainsEnabled,
): ProfileMainTabId {
    const domain = TAB_DOMAIN[active]
    if (domain == null || domains[domain] !== false) return active
    return 'overview'
}
