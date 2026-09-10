'use client'

import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Par «Descansar N s» / «Siguiente serie» (specs/cuenta-atras-en-pantalla, R24 / W4.17) — espejo
 * web de `RestOfferV3` de RN (misma pieza que el PLAN llama `HoldDoneActions`).
 *
 * En la web el único botón manual de descanso que existía era el `ManualTimerButton` de la barra
 * legacy, que en V3 no se pinta ⇒ con la preferencia «Pasar solo al descanso» APAGADA (default del
 * alumno nuevo, R1) el alumno cerraba una serie y no tenía cómo descansar. Este panel es el único
 * camino: «Descansar N s» llama el MISMO `startRest` del provider (lo pasa el paso por `onRest`) y
 * «Siguiente serie» sólo cierra el panel. Sin `rest_time` no hay nada que arrancar ⇒ sólo «Siguiente
 * serie». Al cerrar la ronda de una superserie el par se colapsa en «Ronda lista · Descansar N s»
 * (`kind: 'ronda'`, D2). Con la preferencia ON el descanso arranca solo y este panel NO se pinta.
 */
export function RestOfferV3({
    seconds,
    kind = 'serie',
    onRest,
    onNext,
    className,
    testIdPrefix = 'rest-offer',
}: {
    /** Segundos reales del bloque (`parseRestTime(rest_time)`); ≤ 0 ⇒ sólo «Siguiente serie». */
    seconds: number
    kind?: 'serie' | 'ronda'
    onRest: () => void
    /** Ausente en `ronda`: la siguiente ronda ya está activa, no hay «siguiente» que cerrar. */
    onNext?: () => void
    className?: string
    testIdPrefix?: string
}) {
    const restLabel = kind === 'ronda' ? `Ronda lista · Descansar ${seconds} s` : `Descansar ${seconds} s`
    const nextLabel = kind === 'ronda' ? 'Siguiente ronda' : 'Siguiente serie'
    return (
        <div className={cn('exec-v3-restoffer', className)} data-testid={`${testIdPrefix}-panel`}>
            {seconds > 0 && (
                <button type="button" onClick={onRest} className="exec-v3-juicy exec-v3-restoffer-cta" data-testid={`${testIdPrefix}-rest`}>
                    <Clock className="h-[18px] w-[18px]" aria-hidden />
                    {restLabel}
                </button>
            )}
            {onNext && (
                <button type="button" onClick={onNext} className="exec-v3-holdmod-btn2" data-testid={`${testIdPrefix}-next`}>
                    {nextLabel}
                </button>
            )}
        </div>
    )
}
