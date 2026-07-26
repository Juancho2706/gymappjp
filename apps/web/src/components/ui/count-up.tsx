'use client'

import { useEffect, type Ref } from 'react'
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type SpringOptions,
} from 'framer-motion'

/** Resorte histórico de los contadores del DS (ComplianceRing, peso, bodycomp). */
const DEFAULT_SPRING: SpringOptions = { stiffness: 60, damping: 20 }

/** Formato por defecto: entero redondeado, sin separador de miles. */
const formatInteger = (v: number) => String(Math.round(v))

export interface CountUpTextProps extends Omit<HTMLMotionProps<'span'>, 'children' | 'ref'> {
  /** Ref al `<span>` renderizado (p. ej. para `useInView`). */
  ref?: Ref<HTMLSpanElement>
  /** Valor final del contador. */
  value: number
  /** Formatea el valor interpolado (ej. `(v) => v.toFixed(1)`). Default: entero redondeado. */
  format?: (v: number) => string
  /** Sin interpolación: el texto salta al valor final (sin datos, fuera de viewport, etc.). */
  disabled?: boolean
  /**
   * Config del resorte. Reemplaza (no fusiona) el default `{ stiffness: 60, damping: 20 }`,
   * porque Motion ignora `duration`/`bounce` cuando además hay `stiffness`/`damping`/`mass`.
   */
  spring?: SpringOptions
}

/**
 * Contador numérico compartido: interpola el valor con un resorte de Motion y
 * escribe el texto DIRECTO al DOM (`motion.span` con un MotionValue como hijo;
 * Motion se suscribe y asigna `textContent` de forma imperativa).
 *
 * POR QUÉ ACÁ NO HAY `useState` — NO LO REINTRODUZCAS:
 * el patrón viejo era `useMotionValueEvent(spring, 'change', (v) => setState(v))`,
 * o sea un `setState` POR FRAME. Con el main thread saturado esos commits se
 * encadenan y React 19 los contabiliza como updates anidados; al cruzar
 * `NESTED_UPDATE_LIMIT = 50` tira "Maximum update depth exceeded" y voltea la
 * pantalla entera (incidente EVA-NEXTJS-10/E; upstream facebook/react#32714,
 * cerrado como "not planned"). Por MotionValue un count-up cuesta CERO renders
 * de React, dure los frames que dure.
 *
 * Referencia del patrón ya en producción: `MacroRingSummary` (nutrición alumno).
 *
 * HIDRATACIÓN: el primer render muestra siempre `format(0)` —o `format(value)`
 * si `disabled`—, nunca algo derivado de `useReducedMotion()`: ese hook devuelve
 * `false` en el servidor y puede devolver `true` en el cliente, lo que produciría
 * un mismatch. El salto de reduced-motion ocurre en un efecto, ya hidratado.
 */
export function CountUpText({
  value,
  format = formatInteger,
  disabled = false,
  spring: springConfig = DEFAULT_SPRING,
  ref,
  ...rest
}: CountUpTextProps) {
  const reduce = useReducedMotion()
  // Estático = sin interpolación visible (preferencia del sistema o prop).
  const isStatic = disabled || Boolean(reduce)

  // Inicial determinístico (SSR === cliente). Ojo: `useSpring` arranca en el
  // valor actual de `mv`, así que ambas fuentes coinciden en el primer render.
  const mv = useMotionValue(disabled ? value : 0)
  const spring = useSpring(mv, springConfig)
  const text = useTransform(isStatic ? mv : spring, format)

  useEffect(() => {
    if (isStatic) {
      // `jump` reposiciona el valor y corta cualquier animación en curso: cero frames.
      mv.jump(value)
      spring.jump(value)
      return
    }
    mv.set(value)
  }, [value, isStatic, mv, spring])

  return (
    <motion.span ref={ref} {...rest}>
      {text}
    </motion.span>
  )
}
