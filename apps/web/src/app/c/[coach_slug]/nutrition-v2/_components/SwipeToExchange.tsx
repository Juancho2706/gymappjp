'use client'

import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'

/**
 * Deslizar la fila hacia la izquierda para cambiar el alimento (T2.5 F6).
 *
 * Vale el 2% de la tanda y por eso entra al final: 15 items en toda la base tienen reemplazos del
 * coach, que es lo unico que el gesto puede aplicar a ciegas (ver `swipeApplicableOptions`).
 * Cuando no hay nada aplicable, `onSwipe` abre el sheet en vez de escribir.
 *
 * `framer-motion` ya estaba en la raiz: cero dependencias nuevas.
 */

/** Desplazamiento en px a partir del cual el gesto cuenta como intencion, no como roce. */
const TRIGGER_PX = 56

export function SwipeToExchange({
  enabled,
  label,
  onSwipe,
  children,
}: {
  enabled: boolean
  /** Qué va a pasar al soltar, para el lector de pantalla y el affordance de fondo. */
  label: string
  onSwipe: () => void
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()

  if (!enabled) return <>{children}</>

  return (
    <div className="relative overflow-hidden">
      {/* Fondo que asoma mientras se arrastra: dice qué va a pasar antes de soltar. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-4 text-xs font-medium text-primary"
      >
        <ArrowLeftRight className="h-4 w-4" />
        <span>Cambiar</span>
      </div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -TRIGGER_PX - 24, right: 0 }}
        dragElastic={0.15}
        // Sin `prefers-reduced-motion` vuelve con un resorte; con él, seco. El gesto NO se
        // desactiva: es una forma de operar la app, no un adorno.
        dragTransition={reduceMotion ? { bounceStiffness: 0, bounceDamping: 0 } : undefined}
        onDragEnd={(_event, info) => {
          if (info.offset.x <= -TRIGGER_PX) onSwipe()
        }}
        className="relative touch-pan-y bg-surface-card"
      >
        {children}
      </motion.div>
      {/* El gesto nunca es el ÚNICO camino: la fila conserva su control "⇄ N equivalentes", que es
          lo que usa quien navega con teclado o lector de pantalla. Este botón solo lo duplica para
          tecnologías asistivas sin ocupar espacio visual. */}
      <button type="button" onClick={onSwipe} className="sr-only">
        {label}
      </button>
    </div>
  )
}
