'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView, useMotionValue, animate, motion } from 'framer-motion'

type StatNumberProps = {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  format?: 'plain' | 'currency-clp' | 'compact'
  className?: string
  ariaLabel?: string
}

const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
})

const compactFormatter = new Intl.NumberFormat('es-CL', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function StatNumber({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 1.4,
  format = 'plain',
  className,
  ariaLabel,
}: StatNumberProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const mv = useMotionValue(0)
  const [text, setText] = useState(`${prefix}0${suffix}`)

  useEffect(() => {
    if (!inView) return
    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    })
    return controls.stop
  }, [inView, value, duration, mv])

  useEffect(() => {
    const unsub = mv.on('change', v => {
      let formatted: string
      if (format === 'currency-clp') {
        formatted = clpFormatter.format(Math.round(v))
      } else if (format === 'compact') {
        formatted = compactFormatter.format(v)
      } else {
        formatted = v.toFixed(decimals)
      }
      setText(`${prefix}${formatted}${suffix}`)
    })
    return unsub
  }, [mv, prefix, suffix, decimals, format])

  return (
    <motion.span
      ref={ref}
      className={className}
      aria-label={ariaLabel ?? `${prefix}${value}${suffix}`}
    >
      {text}
    </motion.span>
  )
}
