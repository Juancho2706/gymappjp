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
 * «Siguiente serie» sólo cierra el panel. Al cerrar la ronda de una superserie el par se presenta
 * como «Ronda lista · Descansar N s» / «Siguiente ronda» (`kind: 'ronda'`, D2). Con la preferencia ON
 * el descanso arranca solo y este panel NO se pinta.
 *
 * Reporte del alumno 2026-09-11: `seconds` YA llega resuelto por el motor (`resolveEffectiveRest`) y
 * nunca es 0 —sin `rest_time` configurado el bloque cae al fallback de 60 s—, así que el botón
 * «Descansar N s» siempre está. El guard `seconds > 0` se conserva como cinturón, no como regla.
 */
export function RestOfferV3({
    seconds,
    kind = 'serie',
    onRest,
    onNext,
    nextLabel: nextLabelOverride,
    className,
    testIdPrefix = 'rest-offer',
}: {
    /** Segundos EFECTIVOS del descanso (`resolveEffectiveRest(...).seconds`, siempre > 0). */
    seconds: number
    kind?: 'serie' | 'ronda'
    onRest: () => void
    /** Ausente ⇒ sólo se pinta «Descansar N s». */
    onNext?: () => void
    /** Rótulo del botón de salida cuando el de `kind` no aplica (p. ej. la superserie ya cerró). */
    nextLabel?: string
    className?: string
    testIdPrefix?: string
}) {
    const restLabel = kind === 'ronda' ? `Ronda lista · Descansar ${seconds} s` : `Descansar ${seconds} s`
    const nextLabel = nextLabelOverride ?? (kind === 'ronda' ? 'Siguiente ronda' : 'Siguiente serie')
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
