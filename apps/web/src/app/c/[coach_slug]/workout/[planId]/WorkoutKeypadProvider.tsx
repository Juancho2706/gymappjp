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
import { NumericKeypadSheet, type KeypadField, type KeypadTarget } from './NumericKeypadSheet'

export type { KeypadField, KeypadTarget }

export interface OpenKeypadConfig {
  /** Refs de los `<input>` uncontrolled del `LogSetForm` activo (fuente de verdad). */
  fieldRefs: {
    weight?: React.RefObject<HTMLInputElement | null>
    reps?: React.RefObject<HTMLInputElement | null>
  }
  /** Campo con el que abre (el que el alumno tocó). */
  initialField: KeypadField
  /** Objetivo prescrito (viaja con el teclado — DB-5). */
  target?: KeypadTarget
  /** Coma decimal por campo (default: peso sí, reps no). */
  allowDecimal?: { weight?: boolean; reps?: boolean }
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
 * paso configurable (localStorage `omni_keypad_step`) y publica `--keypad-h` + `body[data-exec-
 * keypad-open]` para que la exec oculte la barra "Finalizar" y reserve espacio (AC-B6).
 *
 * El `<input>` real sigue siendo la fuente de verdad (uncontrolled, con su name/label) → el pipeline
 * submit/FormData/offline no se toca. En puntero fino el teclado NUNCA se abre (gate en `LogSetForm`).
 */
export function WorkoutKeypadProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [config, setConfig] = useState<OpenKeypadConfig | null>(null)
  const [field, setField] = useState<KeypadField>('weight')
  const [display, setDisplay] = useState('')
  const [step, setStep] = useState(DEFAULT_KEYPAD_STEP)
  const [stepMenuOpen, setStepMenuOpen] = useState(false)
  const keypadH = useRef(320)

  useEffect(() => {
    setMounted(true)
    setStep(readKeypadStep())
  }, [])

  const activeRefFor = useCallback(
    (f: KeypadField, cfg: OpenKeypadConfig | null) =>
      (f === 'weight' ? cfg?.fieldRefs.weight : cfg?.fieldRefs.reps)?.current ?? null,
    [],
  )

  const allowDecimalFor = useCallback(
    (f: KeypadField, cfg: OpenKeypadConfig | null) => {
      if (f === 'weight') return cfg?.allowDecimal?.weight ?? true
      return cfg?.allowDecimal?.reps ?? false
    },
    [],
  )

  const hasReps = !!config?.fieldRefs.reps

  /** Escribe el valor en el `<input>` activo (mutación de ref) + refresca el mirror. */
  const writeActive = useCallback(
    (next: string) => {
      const el = activeRefFor(field, config)
      if (el) {
        el.value = next
        // Evento sintético por robustez futura (hoy no hay listeners que dependan de él).
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setDisplay(next)
    },
    [activeRefFor, config, field],
  )

  const openKeypad = useCallback((cfg: OpenKeypadConfig) => {
    const el = (cfg.initialField === 'weight' ? cfg.fieldRefs.weight : cfg.fieldRefs.reps)?.current ?? null
    setConfig(cfg)
    setField(cfg.initialField)
    setStepMenuOpen(false)
    setDisplay(el?.value ?? '')
    triggerHaptic(8)
  }, [])

  const closeKeypad = useCallback(() => {
    setConfig(null)
    setStepMenuOpen(false)
  }, [])

  const refreshDisplay = useCallback(() => {
    if (!config) return
    const el = activeRefFor(field, config)
    setDisplay(el?.value ?? '')
  }, [config, field, activeRefFor])

  const isOpen = useCallback(() => config != null, [config])

  /** Valor vigente del `<input>` activo (fuente de verdad — evita staleness del mirror). */
  const readActive = useCallback(
    () => activeRefFor(field, config)?.value ?? '',
    [activeRefFor, field, config],
  )

  const onDigit = useCallback(
    (d: string) => {
      writeActive(appendKeypadDigit(readActive(), d, { allowDecimal: allowDecimalFor(field, config), maxDecimals: KEYPAD_MAX_DECIMALS }))
      triggerHaptic(6)
    },
    [writeActive, readActive, allowDecimalFor, field, config],
  )

  const onDecimal = useCallback(() => {
    if (!allowDecimalFor(field, config)) return
    writeActive(appendKeypadDecimal(readActive()))
    triggerHaptic(6)
  }, [allowDecimalFor, field, config, writeActive, readActive])

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
      // Los incrementos son de peso; en reps el bloque de chips ni se renderiza.
      writeActive(applyKeypadIncrement(readActive(), delta))
      triggerHaptic(10)
    },
    [writeActive, readActive],
  )

  const onSwitchField = useCallback(
    (f: KeypadField) => {
      if (f === 'reps' && !config?.fieldRefs.reps) return
      const el = activeRefFor(f, config)
      setField(f)
      setStepMenuOpen(false)
      setDisplay(el?.value ?? '')
      triggerHaptic(8)
    },
    [config, activeRefFor],
  )

  const onDone = useCallback(() => {
    const submit = config?.requestSubmit
    triggerHaptic(20)
    closeKeypad()
    // El teclado se cierra al submit exitoso; recién ahí puede arrancar el RestTimer (sin apilarse).
    submit?.()
  }, [config, closeKeypad])

  const onNext = useCallback(() => {
    if (field === 'weight' && config?.fieldRefs.reps) onSwitchField('reps')
    else onDone()
  }, [field, config, onSwitchField, onDone])

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
    const el = activeRefFor(config.initialField, config)
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
                field={field}
                display={display}
                target={config.target}
                allowDecimal={allowDecimalFor(field, config)}
                hasReps={hasReps}
                step={step}
                stepMenuOpen={stepMenuOpen}
                onDigit={onDigit}
                onDecimal={onDecimal}
                onBackspace={onBackspace}
                onClear={onClear}
                onIncrement={onIncrement}
                onSwitchField={onSwitchField}
                onNext={onNext}
                onDone={onDone}
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
