import { FEATURE_DOMAIN_KEYS, type FeatureDomain } from '@eva/feature-prefs'

/**
 * Contrato compartido del aviso «dominio apagado» (Ola de orden W1.3).
 *
 * Módulo PURO a propósito: no importa nada de servidor (`next/navigation`, Supabase, servicios).
 * Lo consumen tanto el gate server-side (`assertDomainEnabled` en `feature-prefs.service.ts`)
 * como los client components del banner (W1.5), que leen el query param del redirect.
 *
 * Recordá que esto es VISIBILIDAD, no autorización: apagar un dominio oculta su superficie en el
 * panel del coach, nunca reemplaza a RLS ni a los entitlements reales.
 */

/** Valor del query param `notice` que dispara el banner «prendé esta función». */
export const DOMAIN_OFF_NOTICE = 'domain_off' as const

/**
 * Destino del redirect cuando el coach entra a una ruta de un dominio que él mismo apagó.
 * Sale con el dominio en la query para que el banner sepa qué función nombrar.
 */
export function domainOffRedirectPath(domain: FeatureDomain): string {
    return `/coach/dashboard?notice=${DOMAIN_OFF_NOTICE}&domain=${domain}`
}

/**
 * Type guard runtime contra `FEATURE_DOMAIN_KEYS`. El `?domain=` del redirect llega del cliente:
 * se parsea con esto y nunca se confía crudo (evita pintar copy con basura de la URL).
 */
export function isFeatureDomain(v: unknown): v is FeatureDomain {
    return typeof v === 'string' && (FEATURE_DOMAIN_KEYS as readonly string[]).includes(v)
}

/**
 * Ruta WEB de la pantalla donde se prende/apaga un dominio (RN tiene la suya en
 * `apps/mobile/lib/domain-off.ts`). El NOMBRE visible (`FUNCIONES_LABEL`) y el copy de los avisos
 * viven en `@eva/feature-prefs` para que web y RN digan exactamente lo mismo; se re-exportan aca
 * para que el codigo web siga importando de un solo modulo. W3 renombra la pantalla: la ruta
 * cambia SOLO aca y el label SOLO en el paquete.
 */
export const FUNCIONES_PATH = '/coach/settings/funciones' as const
export {
    DOMAIN_GENDER,
    DOMAIN_LABELS,
    FUNCIONES_BREADCRUMB,
    FUNCIONES_LABEL,
    domainOffBannerCopy,
    domainOffCopy,
    type DomainOffBannerCopy,
    type DomainOffCopy,
} from '@eva/feature-prefs'
