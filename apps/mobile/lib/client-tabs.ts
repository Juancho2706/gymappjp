/**
 * client-tabs — qué pestañas de la ficha del alumno sobreviven al master switch por DOMINIO
 * (`coach_feature_prefs` / `team_feature_prefs`, resuelto server-side por `/api/mobile/config`).
 *
 * Módulo PURO: cero react-native / expo. El type `ClientTab` se trae de `ClientTabBar` SOLO como
 * `import type` (se borra al compilar), así el runner de la raíz puede testear esto sin arrastrar
 * React Native. Espejo del helper web de la ficha (`.../[clientId]/_lib/profile-tabs.ts`): las dos
 * plataformas ocultan las MISMAS pestañas con la MISMA regla.
 *
 * ## Regla 4A (decisión del owner sobre el mockup 9801fec7)
 *
 * - La pestaña de un dominio apagado NO se muestra: se OCULTA (no se deshabilita ni se avisa).
 * - Si la pestaña activa desaparece, la ficha cae a «Resumen».
 * - «Resumen» y «Progreso» NUNCA se ocultan: no cuelgan de ningún dominio.
 * - Fail-OPEN: solo el `false` explícito apaga; ausente / `true` / mapa vacío ⇒ visible.
 *
 * ## El override POR-ALUMNO no oculta pestañas
 *
 * Esta capa lee el switch del COACH (o del equipo) del workspace del recurso, nunca el override
 * por alumno. Ese override es justamente la puerta para volver a PRENDER un dominio en un alumno
 * puntual: si ocultara la pestaña, el coach se quedaría sin lugar donde re-prenderlo.
 *
 * Esto es VISIBILIDAD (preferencia del coach), no autorización: RLS y entitlements siguen siendo
 * los que mandan en el servidor.
 */
import type { FeatureDomain } from '@eva/feature-prefs'
import type { ClientTab } from '../components/coach/clientDetail/ClientTabBar'

export type { ClientTab }

/**
 * Pestaña → dominio del que depende. Las que no figuran (`overview`, `progreso`, y la legada
 * `facturacion`) no cuelgan de ningún dominio y por eso nunca se ocultan.
 */
export const CLIENT_TAB_DOMAIN: Partial<Record<ClientTab, FeatureDomain>> = {
  analisis: 'training',
  plan: 'training',
  nutricion: 'nutrition',
}

/**
 * Filtra las pestañas cuyo dominio está apagado, conservando el ORDEN original y el objeto tal
 * cual (genérico: la ficha pasa `TabItem[]` con label y badge). Fail-OPEN: solo el `false`
 * explícito saca una pestaña.
 */
export function visibleClientTabs<T extends { value: ClientTab }>(
  tabs: T[],
  domains: Record<FeatureDomain, boolean>,
): T[] {
  return tabs.filter((tab) => {
    const domain = CLIENT_TAB_DOMAIN[tab.value]
    return domain === undefined || domains[domain] !== false
  })
}

/**
 * Pestaña que la ficha debe PINTAR: `tab` si sigue visible, si no `'overview'` (regla 4A). No
 * muta el estado de la pantalla a propósito — al re-prender el dominio, la pestaña que el coach
 * tenía elegida vuelve sola.
 */
export function resolveClientTab(tab: ClientTab, domains: Record<FeatureDomain, boolean>): ClientTab {
  const domain = CLIENT_TAB_DOMAIN[tab]
  if (domain === undefined || domains[domain] !== false) return tab
  return 'overview'
}
