'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion, useSpring } from 'framer-motion'
import {
  NUTRITION_MACROS,
  auraGlowAlpha,
  energyGoalReached,
  energyProgressRatio,
  formatNutritionCalories,
  greetingForHour,
  type NutritionMacroKey,
} from '@eva/nutrition-v2'
import { nutritionIllustrationSource } from '@/components/nutrition-v2'
import { confettiHuePalette } from './aura-hero.logic'

// Confeti diferido: se importa solo al celebrar (no infla el bundle de la vista).
const fireConfetti = (opts: object) =>
  import('canvas-confetti').then((m) => (m.default ?? (m as unknown as typeof m.default))(opts))

type MacroTriplet = {
  protein: { consumed: number; target: number | null }
  carbs: { consumed: number; target: number | null }
  fats: { consumed: number; target: number | null }
}

export interface AuraHeroProps {
  /** Primer nombre para el saludo (si no está disponible, saludo sin nombre). */
  greetingName?: string | null
  calories: { consumed: number; target: number | null }
  macros: MacroTriplet
  /** Fecha local (YYYY-MM-DD): clave de la celebración 1×/día en sessionStorage. */
  dateKey: string
}

// Geometría del anillo principal.
const MAIN_SIZE = 216
const MAIN_STROKE = 16
const MAIN_R = (MAIN_SIZE - MAIN_STROKE) / 2
const MAIN_C = 2 * Math.PI * MAIN_R

/**
 * Héroe "AURA" del Hoy del alumno: saludo por hora + anillo de energía con aura
 * white-label (glow derivado de `--theme-primary-rgb`, intensidad ↑ con el %) +
 * 3 mini-anillos de macro con su paleta categórica. Al cruzar la meta de energía:
 * confeti tintado al primario + ilustración de día completado (1×/día).
 * Respeta prefers-reduced-motion (estado final directo, sin confeti).
 */
export function AuraHero({ greetingName, calories, macros, dateKey }: AuraHeroProps) {
  const reduce = useReducedMotion()
  const heroRef = useRef<HTMLDivElement>(null)

  // Saludo por hora: se calcula tras el montaje para no divergir del SSR (hydration-safe).
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => {
    setHour(new Date().getHours())
  }, [])
  const greeting =
    hour === null
      ? greetingName
        ? `¡Hola, ${greetingName}!`
        : '¡Hola!'
      : greetingForHour(hour, greetingName)

  const { consumed, target } = calories
  const ratio = energyProgressRatio(consumed, target)
  const alpha = auraGlowAlpha(consumed, target)
  const remaining = target != null && target > 0 ? Math.max(target - consumed, 0) : null

  // Celebración de meta de energía: una sola vez por fecha (sessionStorage).
  const [celebrating, setCelebrating] = useState(false)
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (celebratedRef.current) return
    if (!energyGoalReached(consumed, target)) return
    const key = `aura-energy-goal:${dateKey}`
    celebratedRef.current = true
    if (window.sessionStorage.getItem(key)) return
    window.sessionStorage.setItem(key, '1')
    setCelebrating(true)
    if (!reduce) {
      const channels = heroRef.current
        ? getComputedStyle(heroRef.current).getPropertyValue('--theme-primary-rgb')
        : ''
      const colors = confettiHuePalette(channels)
      void fireConfetti({
        particleCount: 72,
        spread: 58,
        startVelocity: 32,
        ticks: 220,
        origin: { x: 0.5, y: 0.42 },
        ...(colors.length > 0 ? { colors } : {}),
      })
    }
  }, [consumed, target, dateKey, reduce])

  // Auto-cierre en efecto propio: si `consumed` cambia dentro de la ventana, el efecto
  // disparador se re-ejecuta con guard temprano y jamás reprogramaría el timeout.
  useEffect(() => {
    if (!celebrating || typeof window === 'undefined') return
    const timeout = window.setTimeout(() => setCelebrating(false), reduce ? 4000 : 3000)
    return () => window.clearTimeout(timeout)
  }, [celebrating, reduce])

  return (
    <motion.section
      ref={heroRef}
      aria-label="Resumen de energía de hoy"
      className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-card p-5 shadow-sm sm:p-6"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Aura/glow detrás del anillo — deriva del primario, intensidad ↑ con el %. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-8 mx-auto h-[280px] max-w-[340px]"
        style={{
          background: `radial-gradient(circle at 50% 42%, rgba(var(--theme-primary-rgb), ${alpha}) 0%, rgba(var(--theme-primary-rgb), 0) 70%)`,
        }}
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
      />

      <div className="relative">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.05 }}
        >
          <p className="font-display text-xl font-bold tracking-tight text-strong sm:text-2xl">{greeting}</p>
          <p className="mt-0.5 text-sm text-muted">
            {target != null && target > 0 ? 'Tu energía de hoy' : 'Vas sumando tu día'}
          </p>
        </motion.div>

        {/* Anillo principal de energía */}
        <div className="mt-5 flex justify-center">
          <div className="relative" style={{ width: MAIN_SIZE, height: MAIN_SIZE }}>
            <svg
              width={MAIN_SIZE}
              height={MAIN_SIZE}
              viewBox={`0 0 ${MAIN_SIZE} ${MAIN_SIZE}`}
              className="-rotate-90"
              role="img"
              aria-label={
                target != null && target > 0
                  ? `${Math.round(consumed)} de ${Math.round(target)} kcal`
                  : `${Math.round(consumed)} kcal consumidas`
              }
            >
              <circle
                cx={MAIN_SIZE / 2}
                cy={MAIN_SIZE / 2}
                r={MAIN_R}
                fill="none"
                strokeWidth={MAIN_STROKE}
                style={{ stroke: 'rgba(var(--theme-primary-rgb), 0.13)' }}
              />
              <motion.circle
                cx={MAIN_SIZE / 2}
                cy={MAIN_SIZE / 2}
                r={MAIN_R}
                fill="none"
                strokeWidth={MAIN_STROKE}
                strokeLinecap="round"
                strokeDasharray={MAIN_C}
                style={{ stroke: 'var(--theme-primary)' }}
                initial={{ strokeDashoffset: MAIN_C }}
                animate={{ strokeDashoffset: MAIN_C * (1 - ratio) }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="font-display text-4xl font-bold tabular-nums leading-none text-strong sm:text-5xl">
                <AnimatedKcal value={consumed} reduce={Boolean(reduce)} />
              </span>
              <span className="mt-1 text-xs font-medium text-subtle">kcal</span>
              {target != null && target > 0 ? (
                <span className="mt-2 text-xs text-muted">
                  de <span className="tabular-nums font-semibold text-body">{formatNutritionCalories(target)}</span>
                </span>
              ) : (
                <span className="mt-2 max-w-[10rem] text-xs text-muted">Registra lo que comas para ver tu avance</span>
              )}
            </div>
          </div>
        </div>

        {remaining != null ? (
          <p className="mt-3 text-center text-sm font-semibold tabular-nums text-primary">
            {remaining > 0 ? `${formatNutritionCalories(remaining)} restantes` : 'Meta de energía cumplida'}
          </p>
        ) : null}

        {/* Mini-anillos de macro (paleta categórica) */}
        <motion.div
          className="mt-5 grid grid-cols-3 gap-3 border-t border-border-subtle pt-5"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.12 }}
        >
          <MacroMiniRing macro="protein" consumed={macros.protein.consumed} target={macros.protein.target} reduce={Boolean(reduce)} />
          <MacroMiniRing macro="carbs" consumed={macros.carbs.consumed} target={macros.carbs.target} reduce={Boolean(reduce)} />
          <MacroMiniRing macro="fats" consumed={macros.fats.consumed} target={macros.fats.target} reduce={Boolean(reduce)} />
        </motion.div>
      </div>

      <AnimatePresence>
        {celebrating ? (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.2 : 0.35, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="flex flex-col items-center gap-3 rounded-sheet bg-surface-card/85 px-6 py-5 shadow-lg backdrop-blur-sm">
              <span
                className="grid h-24 w-24 place-items-center rounded-full"
                style={{ background: 'color-mix(in oklab, var(--theme-primary) 12%, transparent)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ilustración estática (retina srcSet), sin Image Transformations */}
                <img
                  alt=""
                  src={nutritionIllustrationSource('dia-completado').src}
                  srcSet={nutritionIllustrationSource('dia-completado').srcSet}
                  width={96}
                  height={96}
                  className="h-20 w-20 select-none object-contain"
                />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                ¡Meta de energía cumplida!
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.section>
  )
}

/** Número de kcal con transición de resorte al montar y al cambiar (estático si reduce-motion). */
function AnimatedKcal({ value, reduce }: { value: number; reduce: boolean }) {
  const spring = useSpring(0, { stiffness: 130, damping: 22, mass: 0.7 })
  const [display, setDisplay] = useState(reduce ? Math.round(value) : 0)

  useEffect(() => {
    if (reduce) {
      setDisplay(Math.round(value))
      return
    }
    spring.set(value)
  }, [value, reduce, spring])

  useEffect(() => {
    if (reduce) return
    const unsub = spring.on('change', (v) => setDisplay(Math.round(v)))
    return () => unsub()
  }, [spring, reduce])

  return <>{new Intl.NumberFormat('es-CL').format(Math.max(display, 0))}</>
}

// Geometría del mini-anillo.
const MINI_SIZE = 74
const MINI_STROKE = 8
const MINI_R = (MINI_SIZE - MINI_STROKE) / 2
const MINI_C = 2 * Math.PI * MINI_R

const MACRO_TEXT_CLASS: Record<NutritionMacroKey, string> = {
  protein: 'text-ember-700 dark:text-ember-300',
  carbs: 'text-sport-700 dark:text-sport-300',
  fats: 'text-aqua-700 dark:text-aqua-300',
}

function MacroMiniRing({
  macro,
  consumed,
  target,
  reduce,
}: {
  macro: NutritionMacroKey
  consumed: number
  target: number | null
  reduce: boolean
}) {
  const meta = NUTRITION_MACROS[macro]
  const ratio = energyProgressRatio(consumed, target)
  const hasTarget = target != null && target > 0

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      whileHover={reduce ? undefined : { scale: 1.04 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="relative" style={{ width: MINI_SIZE, height: MINI_SIZE }}>
        <svg
          width={MINI_SIZE}
          height={MINI_SIZE}
          viewBox={`0 0 ${MINI_SIZE} ${MINI_SIZE}`}
          className="-rotate-90"
          role="img"
          aria-label={
            hasTarget
              ? `${meta.label}: ${Math.round(consumed)} de ${Math.round(target as number)} g`
              : `${meta.label}: ${Math.round(consumed)} g`
          }
        >
          <circle
            cx={MINI_SIZE / 2}
            cy={MINI_SIZE / 2}
            r={MINI_R}
            fill="none"
            strokeWidth={MINI_STROKE}
            style={{ stroke: `color-mix(in srgb, ${meta.webColor} 16%, transparent)` }}
          />
          <motion.circle
            cx={MINI_SIZE / 2}
            cy={MINI_SIZE / 2}
            r={MINI_R}
            fill="none"
            strokeWidth={MINI_STROKE}
            strokeLinecap="round"
            strokeDasharray={MINI_C}
            style={{ stroke: meta.webColor }}
            initial={{ strokeDashoffset: MINI_C }}
            animate={{ strokeDashoffset: MINI_C * (1 - ratio) }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 110, damping: 18 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="text-sm font-bold tabular-nums text-strong">{Math.round(consumed)}</span>
          {hasTarget ? (
            <span className="text-[10px] tabular-nums text-subtle">/ {Math.round(target as number)}</span>
          ) : null}
        </div>
      </div>
      <span className={`text-xs font-semibold ${MACRO_TEXT_CLASS[macro]}`}>{meta.shortLabel}</span>
    </motion.div>
  )
}
