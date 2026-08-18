'use client'

import Script from 'next/script'
import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
    CONSENT_CHANGE_EVENT,
    getStoredConsent,
    type ConsentValue,
} from '@/lib/posthog/consent'
import {
    META_PIXEL_ID,
    captureFbclidCookie,
    isMetaTrackableRoute,
    trackMetaEvent,
} from '@/lib/meta/pixel'

/**
 * Meta Pixel del root layout. Client component AISLADO a proposito: no se re-exporta por ningun
 * barrel (gotcha del repo: un barrel que mezcla Server Components rompe el bundle cliente).
 *
 * Condiciones para cargar el script — las tres, siempre:
 *  1. `NEXT_PUBLIC_FB_PIXEL_ID` presente (sin env var no se renderiza NADA; no hay ID hardcodeado).
 *  2. Consentimiento `accepted` en `@/lib/posthog/consent` (Ley 21.719, misma puerta que PostHog).
 *  3. Ruta trackeable (nunca arrancar el pixel aterrizando en `/join|/c|/e|/t`).
 *
 * Una vez armado NO se desmonta: `next/script` no re-ejecuta un inline con el mismo `id`, asi que
 * desmontarlo al pasar por una ruta de alumno perderia el PageView del regreso. El filtro de rutas
 * vive en el tracker de eventos, no en el ciclo de vida del script.
 */
export function MetaPixel() {
    const pathname = usePathname()
    const [consent, setConsent] = useState<ConsentValue>(null)
    const [armed, setArmed] = useState(false)

    // Click-id del anuncio → cookie `_fbc`, SIN esperar el consentimiento. Antes vivía dentro de
    // MetaRouteTracker, que solo monta con consentimiento aceptado — así que todo el tráfico frío
    // que no tocaba el banner llegaba a CAPI sin click-id y Meta no podía atar la conversión al
    // anuncio (QA pre-campaña 17-08). Guardarla es atribución first-party propia, no es cargar el
    // script de un tercero: el DATO no sale de acá hasta que un evento (gateado por consentimiento
    // del lado del pixel, y server-side por CAPI) lo use. El fbclid llega en el aterrizaje desde el
    // ad — una carga completa de página — así que leer `location.search` una vez alcanza.
    useEffect(() => {
        captureFbclidCookie(new URLSearchParams(window.location.search).get('fbclid'))
    }, [])

    // Lectura inicial + reaccion al click del banner (mismo tab).
    useEffect(() => {
        setConsent(getStoredConsent())
        const onConsentChange = (event: Event): void => {
            const detail = (event as CustomEvent<ConsentValue>).detail
            setConsent(detail ?? getStoredConsent())
        }
        window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
        return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange)
    }, [])

    useEffect(() => {
        if (armed) return
        if (!META_PIXEL_ID) return
        if (consent !== 'accepted') return
        if (!isMetaTrackableRoute(pathname)) return
        setArmed(true)
    }, [armed, consent, pathname])

    if (!META_PIXEL_ID || !armed) return null

    return (
        <>
            <Script
                id="meta-pixel"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                    __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');
fbq('track','PageView');`,
                }}
            />
            <Suspense fallback={null}>
                <MetaRouteTracker />
            </Suspense>
        </>
    )
}

/**
 * PageView en navegacion SPA — mismo patron que `PageviewTracker` de `@/lib/posthog/provider`
 * (`usePathname` + `useSearchParams` bajo `<Suspense>`, obligatorio para no forzar CSR de la app).
 *
 * El snippet de arriba ya disparo el PageView inicial, asi que este tracker SALTA su primer run.
 * Contar los dos es el error clasico de App Router y duplica todos los PageView de la sesion.
 */
function MetaRouteTracker() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const isFirstRun = useRef(true)

    // fbclid → cookie `_fbc`. Corre tambien en el primer render: el aterrizaje desde el ad ES la
    // navegacion que trae el click-id.
    useEffect(() => {
        captureFbclidCookie(searchParams.get('fbclid'))
    }, [searchParams])

    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        if (!isMetaTrackableRoute(pathname)) return
        trackMetaEvent('PageView')
    }, [pathname, searchParams])

    return null
}
