'use client'

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { triggerHaptic } from '@/lib/client/haptics'
import {
  applyKeypadIncrement,
  appendKeypadDigit,
  appendKeypadDecimal,
  keypadBackspace,
  readKeypadStep,
  writeKeypadStep,
  DEFAULT_KEYPAD_STEP,
  KEYPAD_MAX_DECIMALS,
} from '@/lib/client/keypad-logic'
import { NumericKeypadSheet, type KeypadTarget } from './NumericKeypadSheet'

export type { KeypadTarget }

/** Definición de un campo del teclado (peso/reps de fuerza o duración/distancia/FC de tipados). */
export interface KeypadFieldDef {
  /** Identidad del campo = `name` del `<input>` uncontrolled al que apunta el teclado. */
  key: string
  /** Etiqueta de la pestaña (Kg · Reps · Min · Metros · FC …). */
  label: string
  /** Unidad mostrada junto al display (kg · reps · min · m · bpm …). */
  unit?: string
  /** ¿Admite coma decimal? (peso/min/distancia sí; reps/FC/seg no). */
  allowDecimal: boolean
  /** Sólo el campo de peso muestra los chips de incremento + engranaje del paso. */
  weightChips?: boolean
}

/**
 * Paso OPCIONAL de esfuerzo (RPE/RIR) tras el último campo — sólo fuerza (DB-5 del CEO). Los
 * controles del teclado escriben el MISMO estado del `LogSetForm` vía estos callbacks → el valor
 * viaja en el mismo submit sin pipeline nuevo. `rpe`/`rir` son la semilla al abrir.
 */
export interface KeypadEffortConfig {
  rpe: number | null
  rir: number | null
  onRpeChange: (v: number) => void
  onRirChange: (v: number) => void
}

export interface OpenKeypadConfig {
  /** Campos del teclado en el orden en que "Siguiente" los recorre. */
  fields: KeypadFieldDef[]
  /** Refs de los `<input>` uncontrolled del `LogSetForm` activo (fuente de verdad), por `key`. */
  fieldRefs: Record<string, React.RefObject<HTMLInputElement | null>>
  /** Campo con el que abre (el que el alumno tocó). */
  initialFieldKey: string
  /** Objetivo prescrito (viaja con el teclado — DB-5). */
  target?: KeypadTarget
  /** Paso de esfuerzo tras el último campo (sólo fuerza; null/undefined ⇒ "Listo" submitea directo). */
  effort?: KeypadEffortConfig | null
  /** `form.requestSubmit()` del `LogSetForm` — "Listo" es el único submit. */
  requestSubmit: () => void
}

interface KeypadContextValue {
  openKeypad: (cfg: OpenKeypadConfig) => void
  closeKeypad: () => void
  /** Re-lee el ref activo hacia el mirror (p.ej. tras el autofill "= última vez"). */
  refreshDisplay: () => void
  /** ¿El teclado está abierto? (para no reabrir por focus programático). */
  isOpen: () => boolean
}

const KeypadContext = createContext<KeypadContextValue | null>(null)

/** Consumidor del teclado. Devuelve `null` si no hay provider (desktop / fuera de la exec). */
export function useWorkoutKeypad(): KeypadContextValue | null {
  return useContext(KeypadContext)
}

/** Lleva el input activo por encima del teclado (evita que el keypad tape la fila). */
function scrollInputAboveKeypad(el: HTMLElement | null, keypadH: number, smooth: boolean) {
  if (!el || typeof window === 'undefined') return
  const rect = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  const HEADER_H = 100
  const gap = 20
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
  const safeBottom = vh - keypadH - gap
  if (rect.bottom > safeBottom) {
    window.scrollBy({ top: rect.bottom - safeBottom, behavior })
  } else if (rect.top < HEADER_H) {
    window.scrollBy({ top: rect.top - HEADER_H - 8, behavior })
  }
}

/**
 * Provider del teclado numérico custom (Fase L · workstream B), análogo a `WorkoutTimerProvider`:
 * UNA sola instancia por sesión, portal a `document.body`. Gestiona el campo activo, el mirror del
 * display, la mutación de `ref.value` (mismo mecanismo del autofill "= última vez"), la háptica, el
 * paso configurable (localStorage `omni_keypad_step`), el paso OPCIONAL de esfuerzo (RPE/RIR de
 * fuerza) y publica `--keypad-h` + `body[data-exec-keypad-open]` para que la exec oculte la barra
 * "Finalizar" y reserve espacio (AC-B6).
 *
 * El `<input>` real sigue siendo la fuente de verdad (uncontrolled, con su name/label) → el pipeline
 * submit/FormData/offline no se toca. RPE/RIR viajan por callbacks al estado del `LogSetForm`. En
 * puntero fino el teclado NUNCA se abre (gate en `LogSetForm`).
 */
export function WorkoutKeypadProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [config, setConfig] = useState<OpenKeypadConfig | null>(null)
  const [activeKey, setActiveKey] = useState('')
  const [display, setDisplay] = useState('')
  const [phase, setPhase] = useState<'input' | 'effort'>('input')
  // Espejo local del esfuerzo: se siembra de `config.effort` al abrir y se empuja al `LogSetForm` en
  // cada cambio (el config queda congelado al abrir, así que el mirror es la fuente viva del display).
  const [effortRpe, setEffortRpe] = useState<number | null>(null)
  const [effortRir, setEffortRir] = useState<number | null>(null)
  const [step, setStep] = useState(DEFAULT_KEYPAD_STEP)
  const [stepMenuOpen, setStepMenuOpen] = useState(false)
  const keypadH = useRef(320)

  useEffect(() => {
    setMounted(true)
    setStep(readKeypadStep())
  }, [])

  const fields = config?.fields ?? []
  const activeIndex = fields.findIndex((f) => f.key === activeKey)
  const activeField = activeIndex >= 0 ? fields[activeIndex] : null
  const isLastField = activeIndex >= 0 && activeIndex === fields.length - 1
  const hasEffort = !!config?.effort
  const allowDecimal = activeField?.allowDecimal ?? false
  const showChips = !!activeField?.weightChips

  const refFor = useCallback(
    (key: string, cfg: OpenKeypadConfig | null) => cfg?.fieldRefs[key]?.current ?? null,
    [],
  )

  /** Escribe el valor en el `<input>` activo (mutación de ref) + refresca el mirror. */
  const writeActive = useCallback(
    (next: string) => {
      const el = refFor(activeKey, config)
      if (el) {
        el.value = next
        // Evento sintético por robustez futura (hoy no hay listeners que dependan de él).
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setDisplay(next)
    },
    [refFor, config, activeKey],
  )

  const openKeypad = useCallback((cfg: OpenKeypadConfig) => {
    const el = cfg.fieldRefs[cfg.initialFieldKey]?.current ?? null
    setConfig(cfg)
    setActiveKey(cfg.initialFieldKey)
    setPhase('input')
    setStepMenuOpen(false)
    setDisplay(el?.value ?? '')
    setEffortRpe(cfg.effort?.rpe ?? null)
    setEffortRir(cfg.effort?.rir ?? null)
    triggerHaptic(8)
  }, [])

  const closeKeypad = useCallback(() => {
    setConfig(null)
    setStepMenuOpen(false)
    setPhase('input')
  }, [])

  const refreshDisplay = useCallback(() => {
    if (!config) return
    const el = refFor(activeKey, config)
    setDisplay(el?.value ?? '')
  }, [config, activeKey, refFor])

  const isOpen = useCallback(() => config != null, [config])

  /** Valor vigente del `<input>` activo (fuente de verdad — evita staleness del mirror). */
  const readActive = useCallback(() => refFor(activeKey, config)?.value ?? '', [refFor, activeKey, config])

  const onDigit = useCallback(
    (d: string) => {
      writeActive(appendKeypadDigit(readActive(), d, { allowDecimal, maxDecimals: KEYPAD_MAX_DECIMALS }))
      triggerHaptic(6)
    },
    [writeActive, readActive, allowDecimal],
  )

  const onDecimal = useCallback(() => {
    if (!allowDecimal) return
    writeActive(appendKeypadDecimal(readActive()))
    triggerHaptic(6)
  }, [allowDecimal, writeActive, readActive])

  const onBackspace = useCallback(() => {
    writeActive(keypadBackspace(readActive()))
    triggerHaptic(6)
  }, [writeActive, readActive])

  const onClear = useCallback(() => {
    writeActive('')
    triggerHaptic(12)
  }, [writeActive])

  const onIncrement = useCallback(
    (delta: number) => {
      // Los incrementos son de peso; sólo el campo de peso renderiza los chips.
      writeActive(applyKeypadIncrement(readActive(), delta))
      triggerHaptic(10)
    },
    [writeActive, readActive],
  )

  const onSwitchField = useCallback(
    (key: string) => {
      if (!config?.fieldRefs[key]) return
      const el = refFor(key, config)
      setActiveKey(key)
      setPhase('input')
      setStepMenuOpen(false)
      setDisplay(el?.value ?? '')
      triggerHaptic(8)
    },
    [config, refFor],
  )

  const onDone = useCallback(() => {
    const submit = config?.requestSubmit
    triggerHaptic(20)
    closeKeypad()
    // El teclado se cierra al submit exitoso; recién ahí puede arrancar el RestTimer (sin apilarse).
    submit?.()
  }, [config, closeKeypad])

  const onNext = useCallback(() => {
    if (phase === 'effort') {
      onDone()
      return
    }
    if (!isLastField) {
      const next = fields[activeIndex + 1]
      if (next) onSwitchField(next.key)
      return
    }
    // Último campo: si hay paso de esfuerzo, entra; si no, cierra la serie.
    if (hasEffort) {
      setPhase('effort')
      setStepMenuOpen(false)
      triggerHaptic(8)
      return
    }
    onDone()
  }, [phase, isLastField, hasEffort, fields, activeIndex, onSwitchField, onDone])

  const onEffortBack = useCallback(() => {
    setPhase('input')
    triggerHaptic(6)
  }, [])

  const onEffortRpeChange = useCallback(
    (v: number) => {
      setEffortRpe(v)
      config?.effort?.onRpeChange(v)
      triggerHaptic(8)
    },
    [config],
  )

  const onEffortRirChange = useCallback(
    (v: number) => {
      setEffortRir(v)
      config?.effort?.onRirChange(v)
      triggerHaptic(8)
    },
    [config],
  )

  const onStepChange = useCallback((next: number) => {
    setStep(next)
    writeKeypadStep(next)
    setStepMenuOpen(false)
    triggerHaptic(8)
  }, [])

  const onHeight = useCallback((h: number) => {
    if (h <= 0) return
    keypadH.current = h
    if (typeof document !== 'undefined') {
      document.body.style.setProperty('--keypad-h', `${Math.round(h)}px`)
    }
  }, [])

  // AC-B6: marca el body (oculta la barra "Finalizar" + reserva scroll) y trae la fila activa a la
  // vista por encima del teclado. Limpia todo al cerrar.
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (!config) {
      delete document.body.dataset.execKeypadOpen
      document.body.style.removeProperty('--keypad-h')
      return
    }
    document.body.dataset.execKeypadOpen = 'true'
    const el = config.fieldRefs[config.initialFieldKey]?.current ?? null
    const id = window.requestAnimationFrame(() =>
      scrollInputAboveKeypad(el, keypadH.current, !reducedMotion),
    )
    return () => {
      window.cancelAnimationFrame(id)
      delete document.body.dataset.execKeypadOpen
      document.body.style.removeProperty('--keypad-h')
    }
  // Solo reacciona a la apertura/cierre (no a cada cambio de campo).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const value: KeypadContextValue = {
    openKeypad,
    closeKeypad,
    refreshDisplay,
    isOpen,
  }

  return (
    <KeypadContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {config && (
              <NumericKeypadSheet
                key="workout-keypad"
                fields={fields}
                activeKey={activeKey}
                unit={activeField?.unit ?? ''}
                display={display}
                target={config.target}
                allowDecimal={allowDecimal}
                showChips={showChips}
                phase={phase}
                isLastField={isLastField}
                hasEffort={hasEffort}
                effortRpe={effortRpe}
                effortRir={effortRir}
                step={step}
                stepMenuOpen={stepMenuOpen}
                reducedMotion={reducedMotion}
                onDigit={onDigit}
                onDecimal={onDecimal}
                onBackspace={onBackspace}
                onClear={onClear}
                onIncrement={onIncrement}
                onSwitchField={onSwitchField}
                onNext={onNext}
                onDone={onDone}
                onEffortBack={onEffortBack}
                onEffortRpeChange={onEffortRpeChange}
                onEffortRirChange={onEffortRirChange}
                onClose={closeKeypad}
                onToggleStepMenu={() => setStepMenuOpen((o) => !o)}
                onStepChange={onStepChange}
                onHeight={onHeight}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </KeypadContext.Provider>
  )
}
