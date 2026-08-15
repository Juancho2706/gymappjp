'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { Delete, SlidersHorizontal, Check, ArrowRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { springsSheet } from '@/lib/animation-presets'
import { incrementChipsForStep, formatWeightEsCl, KEYPAD_STEP_PRESETS } from '@eva/workout-engine'

/** Objetivo prescrito que viaja CON el teclado (DB-5: siempre visible mientras se tipea). */
export interface KeypadTarget {
  /** Series prescritas del bloque (fuerza). */
  sets?: number | null
  /** Reps prescritas del bloque (número o rango "8-12"). */
  reps?: number | string | null
  /** Peso objetivo efectivo (sobrecarga progresiva), kg. */
  suggestedWeightKg?: number | null
  /** "Última vez": peso (kg) de la mejor sesión previa. */
  lastWeightKg?: number | null
  /** "Última vez": reps de la mejor sesión previa. */
  lastReps?: number | null
  /** Nombre del ejercicio (contexto del header). */
  exerciseName?: string
  /** Objetivo ya formateado (bloques tipados): pisa la línea calculada de fuerza. */
  objective?: string
}

/** Pestaña de campo del teclado (peso/reps/tipados). */
interface FieldTab {
  key: string
  label: string
}

interface Props {
  /** Campos del teclado (pestañas), en orden. */
  fields: FieldTab[]
  /** `key` del campo activo. */
  activeKey: string
  /** Unidad del campo activo (kg · reps · min · m · bpm …). */
  unit: string
  /** Valor en curso (es-CL, coma decimal) del campo activo. */
  display: string
  target?: KeypadTarget
  /** ¿El campo activo admite coma decimal? (peso/min/distancia sí; reps/FC/seg no) */
  allowDecimal: boolean
  /** ¿El campo activo muestra los chips de incremento de peso? (sólo peso) */
  showChips: boolean
  /** ¿El campo activo es el último de la lista? (define "Siguiente" vs "Listo") */
  isLastField: boolean
  /** Paso configurable de los chips de incremento (kg). */
  step: number
  /** ¿Está abierto el selector de paso? */
  stepMenuOpen: boolean
  reducedMotion: boolean | null
  onDigit: (d: string) => void
  onDecimal: () => void
  onBackspace: () => void
  onClear: () => void
  onIncrement: (deltaKg: number) => void
  onSwitchField: (key: string) => void
  onNext: () => void
  onDone: () => void
  onClose: () => void
  onToggleStepMenu: () => void
  onStepChange: (step: number) => void
  /** Reporta la altura real del panel (para `--keypad-h`). */
  onHeight: (h: number) => void
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

/** Nombre accesible de cada dígito (para lectores de pantalla). */
const DIGIT_LABEL: Record<string, string> = {
  '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
  '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve',
}

function chipLabel(delta: number): string {
  const sign = delta > 0 ? '+' : '−'
  return `${sign}${formatWeightEsCl(Math.abs(delta))}`
}

/**
 * Panel del teclado numérico custom (Fase L · workstream B). 100% presentacional: el estado y la
 * mutación del `<input>` viven en `WorkoutKeypadProvider`. Superficie MÁS tocada de la app del
 * alumno → tap targets grandes (≥56px), dígitos `font-display`, chips como pills, dark siempre.
 * Sirve tanto a fuerza (peso/reps) como a los bloques tipados (duración/distancia/FC/hold/pasadas)
 * — la lista de pestañas y las reglas decimales las manda el provider por props. El esfuerzo
 * (RPE/RIR) NO se captura acá: vive sólo en el panel opcional de la fila.
 */
export function NumericKeypadSheet({
  fields,
  activeKey,
  unit,
  display,
  target,
  allowDecimal,
  showChips,
  isLastField,
  step,
  stepMenuOpen,
  reducedMotion: reducedMotionProp,
  onDigit,
  onDecimal,
  onBackspace,
  onClear,
  onIncrement,
  onSwitchField,
  onNext,
  onDone,
  onClose,
  onToggleStepMenu,
  onStepChange,
  onHeight,
}: Props) {
  const fallbackReducedMotion = useReducedMotion()
  const reducedMotion = reducedMotionProp ?? fallbackReducedMotion
  const panelRef = useRef<HTMLDivElement>(null)

  // Marca del ejecutor V3 (informe 15, MAYOR): el keypad se portea a <body> (fuera de [data-exec-v3])
  // por lo que NO recibe el remap `--sport-500 → --exec-brand`; su acento quedaba azul Sport fijo.
  // Copiamos el `--exec-brand` resuelto del árbol del ejecutor (mismo patrón que DualWheelPicker) y
  // re-mapeamos la rampa sport INLINE en el panel → confirmar/seleccionados adoptan la marca. Fuera de
  // V3 (sin nodo [data-exec-v3]) queda undefined ⇒ el keypad conserva el azul Sport del ejecutor legacy.
  const [execAccent, setExecAccent] = useState<string>()
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.querySelector('[data-exec-v3]')
    if (!root) return
    const v = getComputedStyle(root).getPropertyValue('--exec-brand').trim()
    if (v) setExecAccent(v)
  }, [])
  const brandVars: CSSProperties | undefined = execAccent
    ? ({
        '--sport-500': execAccent,
        '--sport-400': `color-mix(in srgb, ${execAccent} 82%, #fff)`,
        '--sport-300': `color-mix(in srgb, ${execAccent} 68%, #fff)`,
      } as CSSProperties)
    : undefined

  // Publica la altura real del panel → `--keypad-h` (padding del scroll + scroll-into-view).
  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      if (el) onHeight(el.offsetHeight)
      return
    }
    onHeight(el.offsetHeight)
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeight])

  const chips = incrementChipsForStep(step)
  // "Siguiente" salvo que sea el último campo → ahí "Listo" cierra el TECLADO (no la serie: el
  // submit vive en el CTA de la fila — decisión CEO 2026-07-25).
  const primaryIsNext = !isLastField

  const objectiveLine = (() => {
    if (target?.objective) return target.objective
    const parts: string[] = []
    if (target?.sets != null && target?.reps != null) parts.push(`${target.sets}×${target.reps}`)
    else if (target?.reps != null) parts.push(`${target.reps} reps`)
    if (target?.suggestedWeightKg != null) parts.push(`${formatWeightEsCl(target.suggestedWeightKg)} kg`)
    return parts.join(' · ')
  })()
  const hasLast = target?.lastWeightKg != null || target?.lastReps != null

  return (
    <>
      {/* Scrim: tap fuera cierra (no submitea). Debajo del panel (z-50), sobre el footer oculto. */}
      <motion.button
        type="button"
        aria-label="Cerrar teclado"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/25"
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reducedMotion ? undefined : { opacity: 0 }}
        transition={{ duration: 0.15 }}
      />

      <motion.div
        ref={panelRef}
        role="group"
        aria-label="Teclado numérico"
        style={brandVars}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-sheet border-t border-[var(--border-inverse)] bg-[var(--ink-950)] px-3 pb-safe pt-2 shadow-[0_-16px_48px_-12px_rgba(0,0,0,0.7)]"
        initial={reducedMotion ? false : { y: '100%' }}
        animate={{ y: 0 }}
        exit={reducedMotion ? undefined : { y: '100%' }}
        transition={reducedMotion ? { duration: 0 } : springsSheet.enter}
      >
        {/* Grabber + cerrar */}
        <div className="relative flex items-center justify-center pb-1">
          <span aria-hidden className="h-1 w-10 rounded-full bg-white/20" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar teclado"
            className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-on-dark-muted hover:text-on-dark"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Objetivo prescrito — SIEMPRE visible (DB-5) */}
        <div className="flex items-baseline justify-between gap-2 px-1">
          <div className="min-w-0">
            {target?.exerciseName && (
              <p className="truncate text-[11px] font-bold uppercase tracking-wider text-on-dark-muted">
                {target.exerciseName}
              </p>
            )}
            {objectiveLine && (
              <p className="font-mono text-[13px] font-semibold tabular-nums text-on-dark">
                <span className="text-on-dark-muted">Objetivo </span>
                {objectiveLine}
              </p>
            )}
          </div>
          {hasLast && (
            <p className="shrink-0 font-mono text-[11px] tabular-nums text-on-dark-muted">
              Última vez{' '}
              <span className="font-bold text-on-dark">
                {target?.lastWeightKg != null ? `${formatWeightEsCl(target.lastWeightKg)}kg` : '–'}
                {' × '}
                {target?.lastReps ?? '–'}
              </span>
            </p>
          )}
        </div>

        {/* Display + pestañas de campo */}
        <div className="mt-2 flex items-center gap-2 rounded-control border border-[var(--border-inverse)] bg-white/[0.04] p-2 pl-3">
          {fields.length > 1 && (
            <div className="flex shrink-0 rounded-control bg-white/[0.05] p-0.5" role="tablist" aria-label="Campo">
              {fields.map((f) => {
                const selected = f.key === activeKey
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onSwitchField(f.key)}
                    className={cn(
                      'rounded-[10px] px-3 py-1.5 text-[12px] font-bold transition-colors',
                      selected ? 'bg-[var(--sport-500)] text-white' : 'text-on-dark-muted',
                    )}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="ml-auto flex items-baseline gap-1.5">
            <span
              aria-live="polite"
              className={cn(
                'font-display text-3xl font-black tabular-nums leading-none',
                display === '' ? 'text-on-dark-muted/40' : 'text-on-dark',
              )}
            >
              {display === '' ? '0' : display}
            </span>
            {unit && <span className="text-[13px] font-bold text-on-dark-muted">{unit}</span>}
          </div>
        </div>

        {/* Chips de incremento + engranaje del paso (solo peso) */}
        {showChips && (
          <div className="mt-2">
            <div className="flex items-center gap-1.5">
              {chips.map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => onIncrement(delta)}
                  aria-label={`${delta > 0 ? 'más' : 'menos'} ${formatWeightEsCl(Math.abs(delta))} kilos`}
                  className="h-10 flex-1 rounded-full border border-[var(--border-inverse)] bg-white/[0.06] font-mono text-[13px] font-bold tabular-nums text-on-dark transition-transform active:scale-95 hover:bg-white/[0.12]"
                >
                  {chipLabel(delta)}
                </button>
              ))}
              <button
                type="button"
                onClick={onToggleStepMenu}
                aria-label="Ajustar el paso de los incrementos"
                aria-expanded={stepMenuOpen}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors',
                  stepMenuOpen
                    ? 'border-[var(--sport-500)]/60 bg-[var(--sport-500)]/15 text-[var(--sport-300)]'
                    : 'border-[var(--border-inverse)] bg-white/[0.06] text-on-dark-muted hover:text-on-dark',
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
            {stepMenuOpen && (
              <div className="mt-2 rounded-control border border-[var(--border-inverse)] bg-white/[0.03] p-2">
                <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-on-dark-muted">
                  Paso del incremento (kg)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {KEYPAD_STEP_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onStepChange(preset)}
                      aria-pressed={step === preset}
                      className={cn(
                        'h-9 min-w-[52px] flex-1 rounded-control px-2 font-mono text-[13px] font-bold tabular-nums transition-colors',
                        step === preset
                          ? 'bg-[var(--sport-500)] text-white'
                          : 'bg-white/[0.06] text-on-dark hover:bg-white/[0.12]',
                      )}
                    >
                      {formatWeightEsCl(preset)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid 3×4 */}
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {DIGITS.map((d) => (
            <KeyButton key={d} label={DIGIT_LABEL[d]} onClick={() => onDigit(d)}>
              {d}
            </KeyButton>
          ))}
          {/* Fila 4: coma (decimal) · 0 · borrar */}
          {allowDecimal ? (
            <KeyButton label="coma decimal" onClick={onDecimal}>
              ,
            </KeyButton>
          ) : (
            <div aria-hidden />
          )}
          <KeyButton label={DIGIT_LABEL['0']} onClick={() => onDigit('0')}>
            0
          </KeyButton>
          <KeyButton label="borrar" onClick={onBackspace} onLongPress={onClear} className="text-on-dark-muted">
            <Delete className="h-6 w-6" aria-hidden />
          </KeyButton>
        </div>

        {/* Acción — "Siguiente" avanza; "Listo" cierra el teclado (la serie se guarda con el CTA de la fila) */}
        <div className="mt-2">
          <button
            type="button"
            onClick={primaryIsNext ? onNext : onDone}
            aria-label={primaryIsNext ? 'Siguiente' : 'Listo, cerrar teclado'}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-[var(--sport-500)] text-[15px] font-bold text-white transition-transform active:scale-[0.98]"
          >
            {primaryIsNext ? (
              <>
                Siguiente <ArrowRight className="h-5 w-5" />
              </>
            ) : (
              <>
                <Check className="h-5 w-5" /> Listo
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  )
}

/** Tecla del grid — tap target ≥56px, feedback `active:scale`. Long-press opcional (clear en ⌫). */
function KeyButton({
  children,
  label,
  onClick,
  onLongPress,
  className,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  onLongPress?: () => void
  className?: string
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)

  const startPress = () => {
    if (!onLongPress) return
    fired.current = false
    timer.current = setTimeout(() => {
      fired.current = true
      onLongPress()
    }, 450)
  }
  const endPress = () => {
    if (timer.current) clearTimeout(timer.current)
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (fired.current) {
          fired.current = false
          return
        }
        onClick()
      }}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      className={cn(
        'flex h-14 items-center justify-center rounded-control bg-white/[0.06] font-display text-2xl font-bold text-on-dark transition-transform active:scale-95 active:bg-white/[0.14] hover:bg-white/[0.10]',
        className,
      )}
    >
      {children}
    </button>
  )
}
