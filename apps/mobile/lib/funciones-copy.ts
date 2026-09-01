import { NAV_MODULES } from '@eva/coach-nav'
import type { FeatureDomain } from '@eva/feature-prefs'

/**
 * funciones-copy (RN) — copy del toast que confirma prender/apagar un DOMINIO en
 * «Opciones › Funciones» (Ola de orden W2.8 + W3.3).
 *
 * Módulo PURO: cero react-native / expo / supabase, para que lo importen la pantalla
 * (`app/coach/settings/funciones.tsx`) y el runner de la raíz (`tests/mobile/funciones-copy.test.ts`)
 * sin arrastrar el grafo nativo.
 *
 * Por qué existe: hasta W2 la pantalla decidía el mensaje con un `Set` cableado a mano
 * (`DOMAINS_VISIBLE_IN_NAV = ['nutrition','training']` en `settings/mi-panel.tsx`). Era cierto
 * cuando se escribió y dejó de serlo en cuanto W2.1B le dio entrada de nav a Cardio y Movimiento:
 * el coach prendía Cardio, leía «Listo, lo activamos» y el ítem SÍ había aparecido. La fuente de
 * verdad es el REGISTRO del nav (`NAV_MODULES`), el mismo que decide qué se pinta — así el copy se
 * corrige solo el día que un dominio gane o pierda su entrada.
 *
 * Espejo EXACTO de `domainToggleMessage` de la web
 * (`apps/web/src/app/coach/settings/funciones/_actions/mi-panel.actions.ts`): las mismas tres
 * frases, la misma regla. El coach no puede leer una cosa en el teléfono y otra en el navegador.
 */

/**
 * ¿El dominio tiene entrada propia en el menú del coach? Hoy la tienen `nutrition`, `training`,
 * `cardio` y `movement`; `bodycomp` no (vive dentro de la ficha del alumno).
 */
export function domainHasNavItem(domain: FeatureDomain): boolean {
  return NAV_MODULES.some((item) => item.featureDomain === domain)
}

/**
 * Confirmación honesta del master switch. Prender un dominio SIN ítem de nav no cambia nada a la
 * vista: prometer «ya se ve» manda al coach a buscar un menú que no existe.
 */
export function domainToggleMessage(domain: FeatureDomain, enabled: boolean): string {
  if (!enabled) return 'Listo, lo ocultamos.'
  return domainHasNavItem(domain) ? 'Listo, ya se ve.' : 'Listo, lo activamos.'
}
