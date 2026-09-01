'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import {
    DOMAIN_OFF_NOTICE,
    FUNCIONES_PATH,
    domainOffBannerCopy,
    isFeatureDomain,
} from '@/lib/domain-off'

/**
 * Aviso «este dominio lo apagaste vos» del dashboard (Ola de orden W1.5, mockup `9801fec7` 1A/2A).
 *
 * QUIÉN LO DISPARA: el gate server-side `assertDomainEnabled` (W1.3) montado en las rutas de
 * dominio (W1.4). Cuando el coach abre/tipea una ruta de un dominio que él mismo apagó, el gate
 * lo devuelve al panel con `?notice=domain_off&domain=<dominio>` (`domainOffRedirectPath`) y este
 * banner es la ÚNICA explicación de por qué no llegó adonde iba. Sin él el redirect se siente un
 * bug: «hice clic en Cardio y me tiró al inicio».
 *
 * POR QUÉ VA PRIMERO EN LA PILA: es la respuesta directa a la acción que el coach acaba de hacer
 * (los otros banners hablan de estados que vienen de antes: verificación de correo, billing, cupo)
 * y es el único que se va solo. El que responde al último gesto va arriba.
 *
 * TRES REGLAS que no se tocan:
 * · Esto es VISIBILIDAD (preferencia del propio coach), NUNCA autorización: no gatea nada, no
 *   menciona plan/precio/upgrade y no reemplaza a RLS ni a los entitlements.
 * · El `?domain=` llega del cliente: se parsea con `isFeatureDomain` y nunca se confía crudo
 *   (basura en la URL ⇒ no se pinta nada, no se pinta copy inventado).
 * · SIN PERSISTENCIA (decisión 2A): la × lo cierra en el acto y navegar lo hace desaparecer solo.
 *   Ni DB ni localStorage — el aviso vale para ESTE viaje, no es un estado del coach.
 *
 * El copy sale entero de `domainOffBannerCopy` (`@eva/feature-prefs`): web y RN dicen exactamente
 * lo mismo y el nombre de la pantalla («Mi panel») se cambia en UN solo lugar cuando W3 la renombre.
 */
export function DomainOffBanner() {
    const searchParams = useSearchParams()
    const [dismissed, setDismissed] = useState(false)

    if (dismissed) return null
    if (searchParams.get('notice') !== DOMAIN_OFF_NOTICE) return null
    const domain = searchParams.get('domain')
    if (!isFeatureDomain(domain)) return null

    const copy = domainOffBannerCopy(domain)

    function dismiss() {
        setDismissed(true)
        // `history.replaceState` en vez de `router.replace`: limpiar la query con el router
        // refetchearía el RSC del dashboard ENTERO (una recarga de datos completa) solo para
        // esconder un aviso. Esto le saca los params a la URL sin tocar React — el aviso no
        // revive en un reload y el dashboard ni se entera.
        if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname)
        }
    }

    return (
        <div
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-[var(--text-strong)]"
        >
            <SlidersHorizontal className="size-4 shrink-0 text-sport-600" aria-hidden />
            <span className="min-w-0 flex-1">
                <strong>{copy.title}</strong> {copy.hint}
            </span>
            <Link
                href={FUNCIONES_PATH}
                className="inline-flex h-9 shrink-0 touch-manipulation items-center rounded-control bg-[var(--cta-fill)] px-3 text-xs font-bold text-[var(--text-on-sport)] transition-opacity hover:opacity-90"
            >
                {copy.cta}
            </Link>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar aviso"
                className="-mr-1 inline-flex size-8 shrink-0 touch-manipulation items-center justify-center rounded-control text-[var(--text-muted)] transition-colors hover:bg-surface-sunken hover:text-[var(--text-strong)]"
            >
                <X className="size-4" aria-hidden />
            </button>
        </div>
    )
}
