import { Smartphone } from 'lucide-react'

/**
 * «¿Usas la app? Abre EVA en el teléfono» — cierre del circuito web→app del embudo Free→Pro (W6.7).
 *
 * El coach paga en la WEB (el rail de cobro es MercadoPago/Flow; la app no puede tener ninguna
 * superficie de pago, SPEC §«Decisiones cerradas» 1-3). Cuando el pago se confirma, la app en su
 * teléfono todavía cree lo anterior hasta que revalida entitlements. Esta tarjeta es el único
 * puente permitido: web→app SÍ es legal en ambas tiendas — lo prohibido es app→web hacia pago.
 *
 * Es TEXTO, sin botón, a propósito. Un «Abrir EVA en el teléfono» solo funciona si el destino está
 * cubierto por un universal link (iOS) / app link (Android), y `/coach/subscription` NO lo está ni
 * lo va a estar: el 2026-09-25 se retiró del AASA (`public/.well-known/apple-app-site-association`)
 * y de los `intentFilters` de `apps/mobile/app.json` (D5 de `docs/specs/android-113-play`), porque
 * los CTA de los correos de venta apuntan a esta página y, reclamada por la app, el coach caía en
 * «Mi plan», que no puede cobrar. Un botón acá abriría otra pestaña del navegador en la misma
 * página. Si algún día vuelve el puente web→app, que use `eva://` (en Android envuelto en
 * `intent://…;scheme=eva;package=cl.evaapp.eva;end`, como `/auth/confirm`) con su rama en
 * `apps/mobile/app/+native-intent.ts`, no un app link sobre esta ruta.
 *
 * Lo que sí sirve siempre es la instrucción: decirle exactamente qué tocar para que la app se ponga
 * al día — «Actualizar estado», en Mi plan.
 */
export function OpenInAppCard() {
    return (
        <div className="mb-3.5 rounded-control border border-subtle bg-surface-sunken px-3.5 py-3">
            <div className="flex items-start gap-2.5">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-[13px] leading-5 text-strong">
                    ¿Usas la app? Abre EVA en el teléfono y toca «Actualizar estado» en Mi plan para ver el cambio.
                </p>
            </div>
        </div>
    )
}
