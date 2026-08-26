import { cookies, headers } from 'next/headers'
import { decodeBrandHeaderValue } from '@/lib/brand-header-codec'
import { personaNoun } from '@eva/schemas/persona'
import { studentAppOrigin } from '@/lib/coach/invite-code'
import {
    parseVtaFrom,
    parseVtaMode,
    VTA_CLIENT_DISPLAY_NAME_HEADER,
    VTA_CLIENT_IS_DEMO_HEADER,
    VTA_FROM_COOKIE,
    VTA_MODE_HEADER,
} from '@/lib/auth/vive-tu-app-cookies'
import { getDemoViewerPersona } from '../_data/client-root.queries'
import { DemoViewerExit } from './DemoViewerExit'

/**
 * «Estás viendo tu app como {Nombre}» — el banner de la vista de ejemplo
 * (docs/specs/vive-tu-app-directo §3, patrón «impersonar» de GitLab/Adobe LM: estado visible +
 * salida de un toque).
 *
 * Se monta SOLO cuando el proxy marcó `x-client-is-demo` en la rama `/c`: la sesión es el alumno de
 * EJEMPLO, o sea el propio coach mirando su app. Ningún alumno real lo ve nunca.
 *
 * Los datos llegan en headers que ya existían (el proxy lee `clients` en cada request no-prefetch de
 * `/c`), así que el banner no cuesta una query: solo la persona del coach, para no hardcodear
 * «alumno» en copy nuevo (regla de producto 8), y solo en sesión demo.
 *
 * Tres modos, con precedencia `rn` > `return` > `remote` — la fija `/vive-tu-app` en la cookie
 * `eva_vta_mode` y el proxy la traduce a `x-vta-mode`:
 *  - `rn`: el coach vino desde la app. Android necesita `intent://` (un `<a href="eva://">` pelado
 *    da `ERR_UNKNOWN_URL_SCHEME` en Chrome); iOS abre el esquema directo con el gesto. Desde el
 *    builder NO hay deep link: `eva://coach/guia` resetearía el stack con un borrador en pantalla.
 *  - `return`: entró desde el MISMO navegador donde tenía su panel ⇒ `POST /volver-al-panel`
 *    (un `<form>` de verdad: es una mutación y no depende de JS).
 *  - `remote`: cualquier otro caso ⇒ salir por el login (`DemoViewerExit`, cliente).
 *
 * Cero venta acá (regla 7): ni plan, ni precio, ni tier. La app manda al coach exactamente a esta
 * pantalla y las reglas de tienda valen igual en el navegador.
 */

interface Props {
    /** Identificador público del coach en la URL (`/c/<identifier>/…`): slug o código. */
    identifier: string
}

/** Deep link de vuelta a la guía del coach en la app. `+native-intent.ts` conoce esta ruta. */
const RN_RETURN_PATH = 'coach/guia'

function androidIntentUrl(): string {
    const fallback = `${studentAppOrigin()}/login`
    return `intent://${RN_RETURN_PATH}#Intent;scheme=eva;package=cl.evaapp.eva;S.browser_fallback_url=${encodeURIComponent(fallback)};end`
}

export async function DemoViewerBanner({ identifier }: Props) {
    const h = await headers()
    if (h.get(VTA_CLIENT_IS_DEMO_HEADER) !== '1') return null

    const displayName = (decodeBrandHeaderValue(h.get(VTA_CLIENT_DISPLAY_NAME_HEADER)) ?? '').trim()
    const mode = parseVtaMode(h.get(VTA_MODE_HEADER))
    const coachId = h.get('x-coach-id') ?? ''

    const persona = await getDemoViewerPersona(coachId)
    const noun = personaNoun(persona ?? 'other', true)

    const cookieStore = await cookies()
    const from = parseVtaFrom(cookieStore.get(VTA_FROM_COOKIE)?.value)
    const isAndroid = /android/i.test(h.get('user-agent') ?? '')

    const ctaClass =
        'mt-3 inline-flex min-h-[44px] items-center justify-center rounded-control bg-[var(--cta-fill)] px-4 text-sm font-bold tracking-[-0.01em] text-[var(--text-on-sport)] transition-opacity active:scale-[0.98]'

    return (
        <div data-demo-banner className="mx-auto mt-3 max-w-2xl px-4 pt-safe">
            <div className="rounded-xl border border-subtle bg-surface-sunken px-4 py-3" role="status">
                <p className="text-sm font-bold tracking-[-0.01em] text-text-strong">
                    {displayName ? `Estás viendo tu app como ${displayName}.` : 'Estás viendo tu app de ejemplo.'}
                </p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-text-muted">
                    Así se ve tu app para tus {noun}.
                </p>

                {mode === 'rn' && (
                    from === 'builder' ? (
                        <p className="mt-0.5 text-[13.5px] leading-snug text-text-muted">
                            Vuelve a la app con el botón atrás.
                        </p>
                    ) : (
                        <a href={isAndroid ? androidIntentUrl() : `eva://${RN_RETURN_PATH}`} className={ctaClass}>
                            Volver a la app
                        </a>
                    )
                )}

                {mode === 'return' && (
                    <form method="post" action="/volver-al-panel">
                        <button type="submit" className={ctaClass}>
                            Volver a mi panel
                        </button>
                    </form>
                )}

                {mode === 'remote' && <DemoViewerExit loginHref={`/c/${encodeURIComponent(identifier)}/login`} />}
            </div>
        </div>
    )
}
