/**
 * domain-guard — hook de lectura del master switch por DOMINIO (`coach_feature_prefs`), resuelto
 * server-side por `/api/mobile/config` y expuesto por el store de entitlements (W1.2). Es el
 * equivalente RN de `assertDomainEnabled` de la web, con una diferencia de fondo: en web el
 * `redirect()` corre en el Server Component y corta el render; en RN NO existe ese corte, asi que
 * este hook NO navega ni redirige — devuelve el estado y la PANTALLA decide que pinta.
 *
 * ## Contrato de consumo (W1.7) — obligatorio
 *
 * La pantalla NO hace early-return antes de sus hooks. Un `if (!enabled) return <DomainOffNotice/>`
 * arriba del componente cambia la cantidad de hooks que corren entre renders (el guard llega
 * asincrono: primero `ready:false`, despues `ready:true`) y rompe las rules-of-hooks de React con
 * el clasico «Rendered fewer hooks than expected».
 *
 * CORRECCION al PLAN §1.6: ese documento describe el patron como «early return al principio del
 * componente». Tal cual escrito rompe el orden de hooks. El patron correcto — y el que ya usan las
 * pantallas de modulo, ver `apps/mobile/app/coach/cardio/index.tsx:64-106` — tiene dos mitades:
 *
 * 1. El EFECTO de fetch se gatea adentro, nunca se saltea el hook:
 *
 * ```ts
 * const { ready, enabled } = useDomainGuard('cardio')
 * useFocusEffect(useCallback(() => {
 *   if (!ready) return                      // todavia no se sabe: no se pega a la DB
 *   if (!enabled) { setLoading(false); return }  // dominio apagado: cero fetch (money-safety)
 *   // ...fetch real
 * }, [ready, enabled]))
 * ```
 *
 * 2. El JSX elige rama al final, con todos los hooks ya declarados:
 *
 * ```tsx
 * {!ready ? <EvaLoaderScreen /> : !enabled ? <DomainOffNotice domain="cardio" /> : contenido}
 * ```
 *
 * Asi no hay flash de contenido real ni request disparada antes del aviso.
 *
 * `DomainOffNotice` ya existe: vive en `components/coach/DomainOffNotice.tsx` (W1.6c, sobre el
 * mockup aprobado `9801fec7`) y es la rama «apagado» del JSX de arriba. Este archivo sigue
 * entregando solo la logica: no navega, no pinta.
 */
import type { FeatureDomain } from '@eva/feature-prefs'
import { useEntitlements } from './entitlements'

export interface DomainGuard {
    /** `false` hasta la primera resolucion (cache o red): no decidir ni pegar a la DB todavia. */
    ready: boolean
    /** Fail-OPEN: solo el `false` explicito del payload apaga el dominio. */
    enabled: boolean
}

/** Estado del master switch de `domain` para la pantalla actual. Ver el contrato de consumo arriba. */
export function useDomainGuard(domain: FeatureDomain): DomainGuard {
    const { ready, domains } = useEntitlements()
    return { ready, enabled: domains[domain] !== false }
}
