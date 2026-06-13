'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { type ReactNode, type ElementType } from 'react'

// Inlined motion tokens (no dependency on app/enterprise/_lib/enterprise-tokens).
const EASE = [0.16, 1, 0.3, 1] as const
const DURATION = 0.45
const STAGGER = 0.08

type RevealProps = {
  children: ReactNode
  delay?: number
  as?: ElementType
  className?: string
  variant?: 'fadeUp' | 'scale' | 'fade'
  amount?: number
  once?: boolean
}

const VARIANTS: Record<NonNullable<RevealProps['variant']>, Variants> = {
  fadeUp: {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
}

export function Reveal({
  children,
  delay = 0,
  as = 'div',
  className,
  variant = 'fadeUp',
  amount = 0.2,
  once = true,
}: RevealProps) {
  const reduce = useReducedMotion()
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div
  if (reduce) {
    return (
      <MotionTag className={className} initial="visible" variants={VARIANTS[variant]}>
        {children}
      </MotionTag>
    )
  }
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount, margin: '0px 0px -80px 0px' }}
      variants={VARIANTS[variant]}
      transition={{
        duration: DURATION,
        delay,
        ease: EASE,
      }}
    >
      {children}
    </MotionTag>
  )
}

type RevealStaggerProps = {
  children: ReactNode
  className?: string
  as?: ElementType
  stagger?: number
  amount?: number
}

export function RevealStagger({
  children,
  className,
  as = 'div',
  stagger = STAGGER,
  amount = 0.15,
}: RevealStaggerProps) {
  const reduce = useReducedMotion()
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div
  if (reduce) {
    return (
      <MotionTag className={className} initial="visible">
        {children}
      </MotionTag>
    )
  }
  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount, margin: '0px 0px -80px 0px' }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </MotionTag>
  )
}

export function RevealItem({
  children,
  className,
  variant = 'fadeUp',
}: {
  children: ReactNode
  className?: string
  variant?: 'fadeUp' | 'scale' | 'fade'
}) {
  const reduce = useReducedMotion()
  if (reduce) {
    return (
      <motion.div className={className} initial="visible" animate="visible" variants={VARIANTS[variant]}>
        {children}
      </motion.div>
    )
  }
  return (
    <motion.div
      className={className}
      variants={VARIANTS[variant]}
      transition={{
        duration: DURATION,
        ease: EASE,
      }}
    >
      {children}
    </motion.div>
  )
}
