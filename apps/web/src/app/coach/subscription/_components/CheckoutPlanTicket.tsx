import { BadgeCheck, Users } from 'lucide-react'

/**
 * Resumen «ticket» del plan que se va a pagar en el alta (free → pago y registro): qué plan,
 * cuánto y qué se gana. Presentacional puro: el monto y el sufijo los calcula el padre con los
 * mismos helpers que cobra el server (o vienen de la respuesta de create-preference).
 *
 * Las muescas del corte usan `bg-surface-card`: el ticket vive siempre dentro de una card/hoja
 * con ese fondo (modal de /coach/subscription y card de /coach/subscription/processing).
 */
export function CheckoutPlanTicket({
    overline,
    amountClp,
    priceSuffix,
    originalAmountClp = null,
    maxClients = null,
    withoutEvaBadge = false,
}: {
    /** «Pro · Mensual» / «Plan Pro». */
    overline: string
    amountClp: number | null
    priceSuffix: string
    /** Precio sin cupón, tachado encima del neto. */
    originalAmountClp?: number | null
    maxClients?: number | null
    /** El plan saca el sello «Hecho con EVA» de las superficies del alumno. */
    withoutEvaBadge?: boolean
}) {
    const perks = [
        maxClients != null ? { icon: Users, text: `Hasta ${maxClients} alumnos` } : null,
        withoutEvaBadge ? { icon: BadgeCheck, text: 'Tu marca, sin sello EVA' } : null,
    ].filter((p): p is { icon: typeof Users; text: string } => p !== null)

    return (
        <div className="grid min-h-[78px] grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] rounded-2xl bg-sport-100">
            <div className="flex min-w-0 flex-col justify-center gap-0.5 px-4 py-3.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-sport-600">{overline}</span>
                {originalAmountClp != null && amountClp != null && originalAmountClp > amountClp ? (
                    <span className="text-[12px] font-semibold text-muted line-through">
                        ${originalAmountClp.toLocaleString('es-CL')}
                    </span>
                ) : null}
                {amountClp != null ? (
                    <span className="flex items-baseline gap-1">
                        <span className="eva-metric text-[28px] leading-none tracking-tight text-strong sm:text-[30px]">
                            ${amountClp.toLocaleString('es-CL')}
                        </span>
                        <span className="text-[13px] font-semibold text-muted">{priceSuffix}</span>
                    </span>
                ) : null}
            </div>
            <div className="relative flex min-w-0 flex-col justify-center gap-2 py-3 pl-4 pr-3.5">
                {/* Corte punteado con muescas: el detalle que lo hace leer como ticket. */}
                <span aria-hidden="true" className="absolute bottom-3 left-0 top-3 border-l-2 border-dashed border-sport-500/30" />
                <span aria-hidden="true" className="absolute -left-[10px] -top-[9px] h-[18px] w-[18px] rounded-full bg-surface-card" />
                <span aria-hidden="true" className="absolute -bottom-[9px] -left-[10px] h-[18px] w-[18px] rounded-full bg-surface-card" />
                {perks.map(({ icon: Icon, text }) => (
                    <span key={text} className="flex items-center gap-1.5 text-[12.5px] font-semibold leading-tight text-strong">
                        <Icon className="h-[15px] w-[15px] shrink-0 text-sport-600" aria-hidden="true" />
                        {text}
                    </span>
                ))}
            </div>
        </div>
    )
}
