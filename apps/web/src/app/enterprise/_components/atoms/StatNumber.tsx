'use client'

import { useRef } from 'react'
import { useInView } from 'framer-motion'
import { CountUpText } from '@/components/ui/count-up'

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

function formatStat(v: number, format: NonNullable<StatNumberProps['format']>, decimals: number) {
  if (format === 'currency-clp') return clpFormatter.format(Math.round(v))
  if (format === 'compact') return compactFormatter.format(v)
  return v.toFixed(decimals)
}

/**
 * Métrica de la landing enterprise: cuenta hacia arriba al entrar en viewport (1×).
 * El texto lo escribe `CountUpText` vía MotionValue — nada de `setState` por frame,
 * que es lo que hace explotar a React 19 (ver `components/ui/count-up.tsx`).
 */
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

  return (
    <CountUpText
      ref={ref}
      // Fuera de viewport se queda en 0; al entrar, el resorte lo lleva al valor.
      value={inView ? value : 0}
      // Resorte sin rebote con la misma duración del tween anterior (ease expo-out).
      spring={{ duration, bounce: 0 }}
      format={v => `${prefix}${formatStat(v, format, decimals)}${suffix}`}
      className={className}
      aria-label={ariaLabel ?? `${prefix}${value}${suffix}`}
    />
  )
}
