'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'
import { TOUR_COPY, TOUR_HELP_Z } from './tour-engine'
import { useHasSeenTour } from './tour-flags'
import type { TourId } from './tours'

/**
 * El «?» de la Guía Viva (SPEC `nutrition-onboarding-tour`, D2 — INVARIANTE BLOQUEANTE del dueño:
 * «el "?" jamás tapa nada»).
 *
 * Tres cosas de este componente son consecuencia directa de ese invariante y NO son gusto:
 *
 * 1. **30 px exactos, sin área táctil inflada.** Lo normal sería darle padding invisible para llegar
 *    a los 44 px de la guía táctil; acá está prohibido, porque el gate geométrico mide el rect REAL
 *    del botón contra el de todo `button/a/input/select` de la pantalla con tolerancia 0, y un
 *    padding invisible es rect igual que uno visible. 30 px sigue cumpliendo el mínimo AA de destino
 *    (WCAG 2.5.8, 24×24) — el margen se compra corriendo el botón, no agrandándolo.
 * 2. **Semi-transparente + blur.** Sobre el lienzo del editor el botón tiene que dejarse ver sin
 *    pesar: si fuera opaco competiría con las cards que tiene alrededor.
 * 3. **Pulso solo hasta el primer uso.** `useHasSeenTour` (hydration-safe) apaga el pulso apenas el
 *    coach termina o salta el tour; con «Reducir movimiento» no se genera nunca (`motion-safe:`).
 *
 * Dónde ponerlo es decisión de cada superficie (D2 fija: editor ≥1024 esquina inferior IZQUIERDA del
 * lienzo con 14 px de borde; editor <1024 y RN sobre la PublishBar por el lado izquierdo; hub inline
 * junto al título). `floating` trae ese default y `className` lo corre donde haga falta.
 */

export type TourHelpButtonVariant = 'floating' | 'inline'

export type TourHelpButtonProps = {
  /** Qué tour repite. También es la llave del flag que decide el pulso (D4). */
  tourId: TourId
  coachId: string | null | undefined
  variant?: TourHelpButtonVariant
  /** Abrir el tour. Normalmente `controller.start` de `useTourController`. */
  onOpen: () => void
  className?: string
}

/**
 * 14 px del borde (D2) y, en la variante flotante, respetando el área segura inferior — en un
 * teléfono con barra de gestos, `bottom: 14px` pelado deja el botón debajo del pulgar del sistema.
 *
 * `z-[66]`: apenas por encima de la PublishBar (`z-[65]`), que es lo único con lo que comparte
 * esquina; el velo del tour vive mucho más arriba (`z-[90]`) y lo tapa cuando corresponde.
 */
const FLOATING_CLASSES = 'fixed bottom-[max(env(safe-area-inset-bottom,0px),14px)] left-[14px]'

export function TourHelpButton({
  tourId,
  coachId,
  variant = 'inline',
  onOpen,
  className,
}: TourHelpButtonProps) {
  const seen = useHasSeenTour(tourId, coachId)

  return (
    <button
      type="button"
      // `data-tour="help"` es el target del último paso del guion del hub («¿Y este "?"»). En el
      // editor no lo usa nadie y no molesta: hay un solo «?» por superficie.
      data-tour="help"
      data-tour-help={variant}
      data-tour-seen={seen ? 'true' : 'false'}
      aria-label={TOUR_COPY.help}
      onClick={onOpen}
      className={cn(
        'relative inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full',
        'border border-border-subtle bg-surface-card/70 text-[13px] font-bold text-muted backdrop-blur-sm',
        'shadow-sm transition-colors duration-150 hover:bg-surface-card hover:text-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        variant === 'floating' && cn(FLOATING_CLASSES, TOUR_HELP_Z),
        className,
      )}
    >
      {/* Pulso: un anillo que se expande y se desvanece. Va en un hijo `pointer-events-none` y con
          `transform`, así que NO agranda el rect del botón — el gate D2 mide el botón, no el anillo,
          y el invariante de cero solapes sigue siendo verdad mientras el pulso corre. */}
      {seen ? null : (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-sport-500 motion-safe:animate-ping"
        />
      )}
      <span aria-hidden="true" className="relative leading-none">
        ?
      </span>
    </button>
  )
}
