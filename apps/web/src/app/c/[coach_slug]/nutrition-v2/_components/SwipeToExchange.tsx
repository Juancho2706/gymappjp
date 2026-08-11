'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import {
  NUTRITION_SWIPE_HINT_BACK_MS,
  NUTRITION_SWIPE_HINT_DELAY_MS,
  NUTRITION_SWIPE_HINT_HOLD_MS,
  NUTRITION_SWIPE_HINT_OUT_MS,
  NUTRITION_SWIPE_HINT_PEEK_PX,
  NUTRITION_SWIPE_HINT_SEEN_VALUE,
  NUTRITION_SWIPE_HINT_STORAGE_KEY,
  shouldPlaySwipeHint,
} from '@eva/nutrition-v2'

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

/**
 * D5 del QA: nadie descubre el gesto. La PRIMERA fila intercambiable que se monta se asoma una
 * vez y vuelve. Este flag de modulo es el que hace que sea UNA fila y no todas: vive lo que vive
 * la pestaña, y la persistencia de "ya la vio" va a `localStorage`.
 */
let hintClaimedThisSession = false

function readHintSeen(): boolean {
  try {
    return window.localStorage.getItem(NUTRITION_SWIPE_HINT_STORAGE_KEY) === NUTRITION_SWIPE_HINT_SEEN_VALUE
  } catch {
    // Safari en modo privado y navegadores con storage bloqueado tiran acá. Sin memoria, la
    // pista se comporta como si nunca se hubiera visto: molesta menos que reventar la pantalla.
    return false
  }
}

function persistHintSeen(): void {
  try {
    window.localStorage.setItem(NUTRITION_SWIPE_HINT_STORAGE_KEY, NUTRITION_SWIPE_HINT_SEEN_VALUE)
  } catch {
    /* mismo caso que arriba: la pista se repetirá, no es un error que reportar */
  }
}

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
  const controls = useAnimationControls()
  // `mounted` retrasa la decisión al cliente: `localStorage` no existe en el render del servidor
  // y leerlo durante el render rompería la hidratación con un árbol distinto.
  const [mounted, setMounted] = useState(false)
  const claimedByThisRow = useRef(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted) return
    const play = shouldPlaySwipeHint({
      enabled,
      reduceMotion: reduceMotion === true,
      alreadySeen: readHintSeen(),
      claimedBySibling: hintClaimedThisSession && !claimedByThisRow.current,
    })
    if (!play) return

    hintClaimedThisSession = true
    claimedByThisRow.current = true
    persistHintSeen()

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      void controls.start({
        x: [0, -NUTRITION_SWIPE_HINT_PEEK_PX, -NUTRITION_SWIPE_HINT_PEEK_PX, 0],
        transition: {
          duration:
            (NUTRITION_SWIPE_HINT_OUT_MS + NUTRITION_SWIPE_HINT_HOLD_MS + NUTRITION_SWIPE_HINT_BACK_MS) / 1000,
          times: [
            0,
            NUTRITION_SWIPE_HINT_OUT_MS /
              (NUTRITION_SWIPE_HINT_OUT_MS + NUTRITION_SWIPE_HINT_HOLD_MS + NUTRITION_SWIPE_HINT_BACK_MS),
            (NUTRITION_SWIPE_HINT_OUT_MS + NUTRITION_SWIPE_HINT_HOLD_MS) /
              (NUTRITION_SWIPE_HINT_OUT_MS + NUTRITION_SWIPE_HINT_HOLD_MS + NUTRITION_SWIPE_HINT_BACK_MS),
            1,
          ],
          ease: 'easeOut',
        },
      })
    }, NUTRITION_SWIPE_HINT_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [controls, enabled, mounted, reduceMotion])

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
        // Con `prefers-reduced-motion` la fila no rebota: vuelve pegada al límite. El gesto NO se
        // desactiva — es una forma de operar la app, no un adorno.
        //
        // NO usar `dragTransition={{ bounceStiffness: 0, bounceDamping: 0 }}` para eso: un resorte
        // sin fuerza ni amortiguación nunca converge, framer-motion sigue animando indefinidamente
        // y deja el hilo principal ocupado. Con tres filas así, la página no vuelve a estar idle.
        // Lo cazó el QA del preview: el navegador quedaba sin responder.
        dragElastic={reduceMotion ? 0 : 0.15}
        animate={controls}
        onDragStart={() => controls.stop()}
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
