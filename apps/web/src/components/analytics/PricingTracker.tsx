'use client'

import Link from 'next/link'
import {
    useCallback,
    useEffect,
    useState,
    type CSSProperties,
    type FocusEventHandler,
    type MouseEventHandler,
    type ReactNode,
} from 'react'
import { usePostHog } from 'posthog-js/react'
import { useDeferredCapture } from '@/lib/posthog/deferred-capture'
import type { SubscriptionTier } from '@/lib/constants'

/**
 * Donde vive la vitrina que se esta mirando. `/pricing` es una pagina HUERFANA (no la enlaza nadie):
 * el trafico real ve los precios en la seccion `#precios` de la landing, y hasta ahora esa mitad del
 * embudo no emitia nada. La propiedad es ADITIVA — los eventos historicos simplemente no la traen.
 */
export type PricingSurface = 'pricing' | 'landing'

/**
 * pricing_viewed — pageview propio del funnel de precios (Pricing v2 E1, invariante P8).
 *
 * MISMO gate de consentimiento que el resto de PostHog (Ley 21.719) y mismo reintento pre-init:
 * ambos viven en `useDeferredCapture`.
 *
 * `observeElementId`: sin el (caso /pricing) la pagina ENTERA es la vitrina, asi que montarse ya es
 * verla. En la landing los precios son una seccion muy abajo — emitir al montar convertiria
 * `pricing_viewed` en un segundo pageview de la landing (100% de «vieron precios», dato inutil), asi
 * que ahi el evento espera a que la seccion entre en pantalla.
 */
export function PricingViewTracker({
    surface = 'pricing',
    observeElementId,
}: {
    surface?: PricingSurface
    observeElementId?: string
} = {}) {
    const ph = usePostHog()
    const [seen, setSeen] = useState(!observeElementId)

    useEffect(() => {
        if (!observeElementId || seen) return
        const target = document.getElementById(observeElementId)
        // Sin target (o sin IntersectionObserver): degradamos a «visible ya» — perder el evento es
        // peor que adelantarlo.
        if (!target || typeof IntersectionObserver === 'undefined') {
            setSeen(true)
            return
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return
            observer.disconnect()
            setSeen(true)
        })
        observer.observe(target)
        return () => observer.disconnect()
    }, [observeElementId, seen])

    const fire = useCallback(() => ph?.capture('pricing_viewed', { surface }), [ph, surface])
    useDeferredCapture(fire, seen)

    return null
}

/**
 * CTA de plan: captura pricing_plan_clicked({ tier, surface }) al click y navega igual que el Link
 * original (patron UpgradeCTALink). Gated por consentimiento como todo capture: opted-out ⇒ no-op
 * sin requests. Client component aislado para poder usarse desde el Server Component de /pricing.
 *
 * `style` + los handlers de hover existen porque la seccion de precios de la LANDING es una
 * transcripcion 1:1 del diseño con estilos inline y hover por estado — sin esos passthrough, cambiar
 * su `<Link>` por este componente le borraria el hover y el look.
 */
export function PricingPlanLink({
    tier,
    href,
    className,
    style,
    surface = 'pricing',
    children,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
}: {
    tier: SubscriptionTier
    href: string
    className?: string
    style?: CSSProperties
    surface?: PricingSurface
    children: ReactNode
    onMouseEnter?: MouseEventHandler<HTMLAnchorElement>
    onMouseLeave?: MouseEventHandler<HTMLAnchorElement>
    onFocus?: FocusEventHandler<HTMLAnchorElement>
    onBlur?: FocusEventHandler<HTMLAnchorElement>
}) {
    const ph = usePostHog()
    return (
        <Link
            href={href}
            className={className}
            style={style}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onFocus={onFocus}
            onBlur={onBlur}
            onClick={() => {
                ph?.capture('pricing_plan_clicked', { tier, surface })
            }}
        >
            {children}
        </Link>
    )
}
