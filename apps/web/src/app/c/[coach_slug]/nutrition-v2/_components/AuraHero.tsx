'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  NUTRITION_MACROS,
  auraGlowAlpha,
  energyBandGeometry,
  energyGoalReached,
  energyProgressRatio,
  formatNutritionCalories,
  greetingForHour,
  type NutritionMacroKey,
} from '@eva/nutrition-v2'
import { nutritionIllustrationSource } from '@/components/nutrition-v2'
import { CountUpText } from '@/components/ui/count-up'
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
  /**
   * Racha honesta semanal (T2.7 F2, catálogo Hoy #7): días de ESTA semana dentro del rango de
   * energía. `null`/ausente = sin días evaluables todavía — el chip no se pinta (afirmar
   * "0 de 7" un lunes a las 9am sería desánimo gratis, no honestidad).
   */
  weekInRangeCount?: number | null
}

/**
 * Héroe "AURA" del Hoy del alumno: saludo por hora + BANDA de energía con el rango ±10%
 * sombreado (T2.7 F2, decisión D-A del owner: la banda del catálogo reemplaza al anillo
 * grande — la meta es un rango, no un número que se falla) + aura white-label (glow derivado
 * de `--theme-primary-rgb`, intensidad ↑ con el %) + 3 mini-anillos de macro con su paleta
 * categórica fija. Al cruzar la meta de energía: confeti tintado al primario + ilustración
 * de día completado (1×/día). Respeta prefers-reduced-motion (estado final directo, sin confeti).
 */
export function AuraHero({ greetingName, calories, macros, dateKey, weekInRangeCount = null }: AuraHeroProps) {
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
  const alpha = auraGlowAlpha(consumed, target)
  // Riel de la banda (0..115% de la meta) con la zona objetivo ±10% adentro; null sin meta.
  const band = energyBandGeometry(consumed, target)
  // Banda ±10% (T1.4, nutrition-flows-redesign): la meta es un RANGO, no un numero que se
  // falla. Copy por tramo: bajo el rango (marca), en rango (success fijo), sobre el rango
  // (ambar — nunca rojo: comer no es un error). La celebracion de meta no cambia.
  const rangeLow = target != null && target > 0 ? Math.round(target * 0.9) : null
  const rangeHigh = target != null && target > 0 ? Math.round(target * 1.1) : null

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
      {/* Aura/glow detrás del bloque de energía — deriva del primario, intensidad ↑ con el %.
          Con la banda el bloque es más bajo que el anillo viejo: el halo se achica con él. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-[170px] max-w-[420px]"
        style={{
          background: `radial-gradient(ellipse at 50% 55%, rgba(var(--theme-primary-rgb), ${alpha}) 0%, rgba(var(--theme-primary-rgb), 0) 70%)`,
        }}
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduce ? 0 : 0.6, ease: 'easeOut' }}
      />

      <div className="relative">
        <motion.div
          className="flex items-start justify-between gap-3"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.05 }}
        >
          <div className="min-w-0">
            <p className="font-display text-xl font-bold tracking-tight text-strong sm:text-2xl">{greeting}</p>
            <p className="mt-0.5 text-sm text-muted">
              {target != null && target > 0 ? 'Tu energía de hoy' : 'Vas sumando tu día'}
            </p>
          </div>
          {/* Racha honesta semanal (catálogo Hoy #7): "N de 7 en rango" — nunca un streak frágil
              que se rompe un martes. Solo se pinta con días evaluables. */}
          {weekInRangeCount != null ? (
            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-pill bg-success/12 px-2.5 py-1 text-xs font-semibold tabular-nums text-success">
              {weekInRangeCount} de 7 en rango
            </span>
          ) : null}
        </motion.div>

        {/* Banda de energía (T2.7 F2, D-A): riel 0→115% de la meta con la zona ±10% sombreada.
            Verde dentro, ámbar al pasarse — nunca rojo: comer no es un error. */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {rangeLow != null && rangeHigh != null ? (
                <>
                  Energía · rango{' '}
                  <span className="tabular-nums">
                    {KCAL_FORMATTER.format(rangeLow)}–{KCAL_FORMATTER.format(rangeHigh)}
                  </span>
                </>
              ) : (
                'Energía'
              )}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-3xl font-bold tabular-nums leading-none text-strong sm:text-4xl">
                <AnimatedKcal value={consumed} />
              </span>
              <span className="text-xs font-medium text-subtle">kcal</span>
            </span>
          </div>

          {band != null ? (
            <>
              <div
                role="img"
                aria-label={`${Math.round(consumed)} de ${Math.round(target as number)} kcal`}
                className="relative mt-2.5 h-3 overflow-hidden rounded-pill"
                style={{ background: 'rgba(var(--theme-primary-rgb), 0.13)' }}
              >
                {/* Zona objetivo ±10%: success SEMÁNTICO fijo (no white-label). */}
                <div
                  aria-hidden="true"
                  className="absolute inset-y-0"
                  style={{
                    left: `${band.zoneStartPercent}%`,
                    width: `${band.zoneEndPercent - band.zoneStartPercent}%`,
                    background: 'color-mix(in srgb, var(--color-success) 30%, transparent)',
                  }}
                />
                <motion.div
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-pill"
                  style={{ background: 'var(--theme-primary)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${band.fillPercent}%` }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18, mass: 0.9 }}
                />
              </div>
              {rangeLow != null && rangeHigh != null ? (
                <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-subtle">consumido</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      consumed > rangeHigh ? 'text-warning' : consumed >= rangeLow ? 'text-success' : 'text-primary'
                    }`}
                  >
                    {consumed < rangeLow
                      ? `faltan ~${formatNutritionCalories(rangeLow - consumed)} para tu rango`
                      : consumed <= rangeHigh
                        ? '✓ en tu rango de hoy'
                        : `+${formatNutritionCalories(consumed - rangeHigh)} sobre tu rango`}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted">Registra lo que comas para ver tu avance</p>
          )}
        </div>

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

const KCAL_FORMATTER = new Intl.NumberFormat('es-CL')

/**
 * Número de kcal con transición de resorte al montar y al cambiar (estático si reduce-motion).
 * El texto lo escribe `CountUpText` vía MotionValue: cero renders de React por frame
 * (ver `components/ui/count-up.tsx`).
 */
function AnimatedKcal({ value }: { value: number }) {
  return (
    <CountUpText
      value={value}
      spring={{ stiffness: 130, damping: 22, mass: 0.7 }}
      format={(v) => KCAL_FORMATTER.format(Math.max(Math.round(v), 0))}
    />
  )
}

// Geometría del mini-anillo.
const MINI_SIZE = 74
const MINI_STROKE = 8
const MINI_R = (MINI_SIZE - MINI_STROKE) / 2
const MINI_C = 2 * Math.PI * MINI_R

// T2.7 F1: trio fijo de macros (tokens canonicos --color-macro-*), identico claro/oscuro.
const MACRO_TEXT_CLASS: Record<NutritionMacroKey, string> = {
  protein: 'text-macro-protein',
  carbs: 'text-macro-carbs',
  fats: 'text-macro-fats',
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
