'use client'

import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import {
  NUTRITION_MOTION,
  type NutritionExchangeFoodRead,
  type NutritionMealSlotRead,
  type NutritionSlotExchangeTargetRead,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { NutritionMotionButton } from '@/components/nutrition-v2'
import type { PortionMarksApi } from './PortionMarks'
import { PortionGroupCircle } from './PortionCoverageRow'
import {
  derivedFoodNames,
  extraPortionsValue,
  formatPortionsEs,
  orderedExchangeTargets,
  portionBarFractions,
  portionChipIsCompact,
  segmentsForTarget,
  slotHasPortionTargets,
  type PortionSegment,
} from './portion-marks.logic'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const LONG_PRESS_MS = 450

/**
 * Segmento decorativo del chip (una porción prescrita; media = semicírculo final).
 * Lleno = `primary` del coach (white-label), NUNCA el color del grupo. Derivado de
 * alimento = relleno `primary` atenuado con anillo fino (se distingue del marcado a
 * mano). Los segmentos son decorativos (`aria-hidden`): el contador `n/N` es el
 * texto real.
 */
function SegmentDot({
  segment,
  pending,
  derivedTitle,
  reduceMotion,
}: {
  segment: PortionSegment
  pending: boolean
  derivedTitle: string | null
  reduceMotion: boolean
}) {
  const half = segment.capacity === 0.5
  const fillFraction = Math.min(1, (segment.marked + segment.derived) / segment.capacity)
  const isDerived = segment.derived > 0
  const rounded = half ? 'rounded-l-full' : 'rounded-full'
  return (
    <span
      className={cx(
        'relative inline-block h-3 overflow-hidden border bg-surface-sunken',
        half ? 'w-[7px]' : 'w-3',
        rounded,
        fillFraction > 0 ? 'border-primary/60' : 'border-border-default',
        pending && 'opacity-60',
      )}
      title={isDerived && derivedTitle ? derivedTitle : undefined}
    >
      <motion.span
        animate={{ width: `${fillFraction * 100}%` }}
        className={cx('absolute inset-y-0 left-0', isDerived ? 'bg-primary/70' : 'bg-primary')}
        initial={false}
        transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.selection.duration / 1000 }}
      />
      {isDerived ? (
        <span aria-hidden="true" className={cx('absolute inset-0 ring-1 ring-inset ring-primary', rounded)} />
      ) : null}
    </span>
  )
}

/**
 * Chip interactivo de un grupo en la franja (SPEC UX-b): tap = marcar el siguiente
 * segmento pendiente (JAMÁS abre el sheet); long-press = atajo al sheet de
 * equivalencias (el botón [Equivalencias] es el camino siempre visible).
 */
function PortionChip({
  slot,
  target,
  api,
  onLongPress,
  onRequestExtra,
  derivedTitle,
}: {
  slot: NutritionMealSlotRead
  target: NutritionSlotExchangeTargetRead
  api: PortionMarksApi
  onLongPress: () => void
  onRequestExtra: () => void
  derivedTitle: string | null
}) {
  const reduceMotion = useReducedMotion() ?? false
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const coverage = api.coverageFor(slot.code, target)
  const next = api.nextMarkFor(slot.code, target)
  const pending = api.hasInFlight(slot.code, target.groupCode)
  // Cap visual H4: >8 segmentos ⇒ barra continua compacta (jamás desborda en 360 px).
  const compact = portionChipIsCompact(target.portions)
  const bar = compact
    ? portionBarFractions(target.portions, coverage.marcadas, coverage.derivadas)
    : null
  const segments = compact
    ? []
    : segmentsForTarget(target.portions, coverage.marcadas, coverage.derivadas)
  // Estilo pending (NutritionSyncState-like) sobre el último segmento CON llenado.
  const lastFilledIndex = segments.reduce(
    (acc, segment, index) => (segment.marked + segment.derived > 0 ? index : acc),
    -1,
  )
  const extra = extraPortionsValue(target.portions, coverage.coverage)
  const shown = Math.min(coverage.coverage, target.portions)
  const counter = `${formatPortionsEs(Math.round(shown * 10) / 10)}/${formatPortionsEs(target.portions)}`
  const ariaN = formatPortionsEs(Math.round(coverage.coverage * 10) / 10)
  const ariaTotal = formatPortionsEs(target.portions)
  const ariaLabel =
    next.portions === 0.5
      ? PORTIONS_COPY.student.halfChipAria(target.groupName, ariaN, ariaTotal)
      : PORTIONS_COPY.student.chipAria(target.groupName, ariaN, ariaTotal)

  const clearTimer = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const handleTap = () => {
    if (next.extra) {
      onRequestExtra()
      return
    }
    api.mark({ slot, target, portions: next.portions })
  }

  return (
    <motion.button
      aria-label={ariaLabel}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false
          return
        }
        handleTap()
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={clearTimer}
      onPointerDown={() => {
        longPressed.current = false
        clearTimer()
        pressTimer.current = setTimeout(() => {
          longPressed.current = true
          onLongPress()
        }, LONG_PRESS_MS)
      }}
      onPointerLeave={clearTimer}
      onPointerUp={clearTimer}
      type="button"
      whileTap={reduceMotion ? undefined : { scale: NUTRITION_MOTION.press.scale }}
    >
      <PortionGroupCircle code={target.groupCode} color={target.color} sortOrder={target.orderIndex} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">{target.groupName}</span>
      {pending ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
          title={PORTIONS_COPY.student.saving}
        />
      ) : null}
      {compact && bar ? (
        // Barra continua compacta (H4): relleno pleno = marcadas, atenuado = derivadas.
        <span
          aria-hidden="true"
          className={cx(
            'relative inline-block h-2.5 w-16 shrink-0 overflow-hidden rounded-full border bg-surface-sunken',
            bar.marked + bar.derived > 0 ? 'border-primary/60' : 'border-border-default',
            pending && 'opacity-60',
          )}
          title={bar.derived > 0 && derivedTitle ? derivedTitle : undefined}
        >
          <motion.span
            animate={{ width: `${(bar.marked + bar.derived) * 100}%` }}
            className="absolute inset-y-0 left-0 bg-primary/70"
            initial={false}
            transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.selection.duration / 1000 }}
          />
          <motion.span
            animate={{ width: `${bar.marked * 100}%` }}
            className="absolute inset-y-0 left-0 bg-primary"
            initial={false}
            transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.selection.duration / 1000 }}
          />
        </span>
      ) : (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          {segments.map((segment, index) => (
            <SegmentDot
              derivedTitle={derivedTitle}
              key={index}
              pending={pending && index === lastFilledIndex}
              reduceMotion={reduceMotion}
              segment={segment}
            />
          ))}
        </span>
      )}
      {extra > 0 ? (
        <span className="shrink-0 rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
          {PORTIONS_COPY.student.extraBadge(formatPortionsEs(extra))}
        </span>
      ) : null}
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{counter}</span>
    </motion.button>
  )
}

/**
 * Sección de porciones dentro de la card de franja del "Hoy" (SPEC UX-b): hint +
 * un chip interactivo por grupo + confirmación inline del exceso + botón
 * [Equivalencias] siempre visible. Franja sin targets ⇒ no renderiza nada (Q1).
 */
export function PortionSlotSection({
  slot,
  api,
  exchangeFoods,
  onOpenSheet,
}: {
  slot: NutritionMealSlotRead
  api: PortionMarksApi
  exchangeFoods: NutritionExchangeFoodRead[] | undefined
  onOpenSheet: (slotCode: string, groupCode: string) => void
}) {
  const [confirmGroup, setConfirmGroup] = useState<string | null>(null)
  if (!slotHasPortionTargets(slot)) return null
  const targets = orderedExchangeTargets(slot)

  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <p className="text-xs text-muted">{PORTIONS_COPY.student.slotHint}</p>
      <div className="mt-2 space-y-1.5">
        {targets.map((target) => {
          const names = derivedFoodNames(slot.intakeItems, exchangeFoods, target.groupCode)
          const derivedTitle =
            names.length > 0 ? PORTIONS_COPY.student.coveredBy(names.join(', ')) : null
          return (
            <div key={target.id}>
              <PortionChip
                api={api}
                derivedTitle={derivedTitle}
                onLongPress={() => onOpenSheet(slot.code, target.groupCode)}
                onRequestExtra={() => setConfirmGroup(target.groupCode)}
                slot={slot}
                target={target}
              />
              {confirmGroup === target.groupCode ? (
                <div
                  className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700/60 dark:bg-amber-950/40"
                  role="alertdialog"
                  aria-label={PORTIONS_COPY.student.extraConfirm(target.groupName)}
                >
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                    {PORTIONS_COPY.student.extraConfirm(target.groupName)}
                  </p>
                  <span className="flex items-center gap-1.5">
                    <NutritionMotionButton
                      className="min-h-9 px-3 text-xs"
                      onClick={() => setConfirmGroup(null)}
                      tone="neutral"
                    >
                      {PORTIONS_COPY.student.extraCancel}
                    </NutritionMotionButton>
                    <NutritionMotionButton
                      className="min-h-9 px-3 text-xs"
                      onClick={() => {
                        setConfirmGroup(null)
                        api.mark({ slot, target, portions: 1 })
                      }}
                      tone="warning"
                    >
                      {PORTIONS_COPY.student.extraConfirmYes}
                    </NutritionMotionButton>
                  </span>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <button
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpenSheet(slot.code, targets[0]?.groupCode ?? '')}
        type="button"
      >
        <BookOpen aria-hidden="true" className="h-4 w-4" />
        {PORTIONS_COPY.student.equivalences}
      </button>
    </div>
  )
}
