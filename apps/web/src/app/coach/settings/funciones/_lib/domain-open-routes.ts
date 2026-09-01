import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'

/**
 * A donde lleva el boton «Abrir» de cada dominio en «Funciones» (Ola de orden W3.1, decision 6A).
 *
 * Modulo PURO a proposito (cero React / Next / Supabase): lo consumen el client component de las
 * filas y su test. Reemplaza al launcher `/coach/tools`, que era la unica forma de entrar a
 * Cardio, Movimiento y Composicion sin usar el menu.
 *
 * `null` = el dominio NO tiene pantalla propia y se abre de otra forma. Hoy solo `bodycomp`: la
 * captura es 1-a-1, asi que primero pide elegir alumno y recien ahi navega a su ficha.
 *
 * Ojo: esto es NAVEGACION, no autorizacion. El boton se muestra solo con el dominio prendido
 * (visibilidad); el techo real lo siguen poniendo RLS y los entitlements de cada pantalla.
 */
export const DOMAIN_OPEN_ROUTES: Record<FeatureDomain, string | null> = {
    // Nutricion apunta al hub V2 (estandar para todos los planes), no al cockpit V1.
    nutrition: '/coach/nutrition-v2',
    training: '/coach/workout-programs',
    cardio: '/coach/cardio',
    movement: '/coach/movement',
    bodycomp: null,
}

/** Destino del «Abrir» de un dominio, o `null` si abre el selector de alumno. */
export function domainOpenHref(domain: FeatureDomain): string | null {
    return DOMAIN_OPEN_ROUTES[domain] ?? null
}

/** Los dominios que el mapa cubre, en orden de registro (para el test de contrato). */
export const DOMAIN_OPEN_KEYS = FEATURE_DOMAIN_KEYS
