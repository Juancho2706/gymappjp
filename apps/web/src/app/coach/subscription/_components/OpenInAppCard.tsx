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
 * cubierto por un universal link (iOS) / app link (Android), y hoy `/coach/subscription` NO lo
 * está: el AASA (`public/.well-known/apple-app-site-association`) y los `intentFilters` de
 * `apps/mobile/app.json` cubren `/c/*`, `/invite/*` y `/reset-password`. Ambos ya quedaron
 * preparados para esta ruta, pero el `intentFilter` viaja en un BINARIO nuevo (no por OTA) y el
 * AASA tarda en propagar por la CDN de Apple, así que un botón hoy sería una promesa que el sistema
 * operativo no cumple: abriría otra pestaña del navegador en la misma página. Vuelve cuando el
 * binario con el filtro esté en las tiendas y el AASA propagado (W6.7 en TASKS).
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
