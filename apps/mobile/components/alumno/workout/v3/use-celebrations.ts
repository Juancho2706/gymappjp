/**
 * Orquestador de celebraciones del ejecutor V3 (E4.1) — punto ÚNICO de decisión: recibe eventos
 * SEMÁNTICOS del flujo existente (serie cerrada, ejercicio/ronda completos, PR real, sesión completada),
 * los pasa por `celebrationTierFor` del motor y dispara la presentación del tier. NO duplica lo que ya
 * existe: consolida el haptic por tier (antes disperso en `handleCommit`/`signalCommitted`) y el estado
 * del PR en vivo (E4.2); el "+1 serie" del interstitial y el banner "Ronda lista" siguen siendo la salida
 * VISUAL micro/media (viven en `RestInterstitialV3`), este hook solo los gobierna.
 *
 * Dosificación (contrato `celebration.ts`): micro = tick ligero, media = éxito corto, épica = SOLO PR real
 * (toast+confeti+borde dorado, E4.2) y fin de sesión (Wave 2). El haptic se gatea por la preferencia de
 * VIBRACIÓN de la tuerca; el sonido de celebración (OFF por defecto) queda no-op hasta Ola 5 pero se
 * respeta la preferencia igual. reduced-motion lo maneja la capa visual (fades), no este hook.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  celebrationTierFor,
  type CelebrationContext,
  type CelebrationTier,
  type PrBest,
  type PrKind,
  type WorkoutCelebrationEvent,
} from '@eva/workout-engine'
import { haptics } from '../../../../lib/haptics'
import { isRestTimerVibrationEnabled } from '../timers/rest-timer-preferences'
import { getExecSettings } from './exec-settings'

// Duración del toast/confeti/borde dorado del PR (contrato mockup concepto-a-v3-momentos: ~1,5s, no corta
// el flujo). Coincide con la ventana del pulso dorado de la fila (`recentSet` en ExecutorV3).
export const PR_CELEBRATION_MS = 1500

export interface PrCelebrationState {
  blockId: string
  setNumber: number
  /** Ejercicio del récord — clave de dosificación (una épica por ejercicio/sesión). */
  exerciseId: string
  /** Eje del récord: `weight` (peso absoluto) o `e1rm` (1RM estimado). */
  kind: PrKind
  /** Peso de la serie récord (kg) — para "¡PR! {kg} kg — tu mejor marca". */
  weightKg: number
  /** Mejor marca histórica superada (para el chip "Anterior" tachado). */
  prevBest: PrBest
  /** Reinicia la animación de confeti cuando se re-dispara (varias PRs seguidas). */
  nonce: number
}

export interface PrCelebrationInput {
  blockId: string
  setNumber: number
  exerciseId: string
  kind: PrKind
  weightKg: number
  prevBest: PrBest
}

export interface CelebrationsApi {
  /** Emite un evento semántico → tier + haptic gateado. Devuelve el tier (o null si el evento no celebra). */
  celebrate: (event: WorkoutCelebrationEvent, ctx?: CelebrationContext) => CelebrationTier | null
  /**
   * Celebra un PR REAL (épica de E4.2): dispara el haptic doble SIEMPRE, y el toast+confeti UNA vez por
   * ejercicio/sesión (dosificación anti-fatiga; el pulso dorado inline de la fila sí se mantiene por serie).
   * Devuelve true si abrió la presentación (primera vez del ejercicio), false si solo hizo el haptic.
   */
  celebratePr: (input: PrCelebrationInput) => boolean
  /** Estado del PR en vivo para el host (`null` = sin celebración activa). */
  prCelebration: PrCelebrationState | null
  /** Cierra la celebración de PR antes de tiempo (skippable). */
  dismissPr: () => void
}

/**
 * Hook central de celebraciones. Se monta una vez en `ExecutorV3`; el flujo le empuja eventos y él decide
 * tier + presentación. Puro respecto del motor de guardado (solo consume `celebrationTierFor`).
 */
export function useCelebrations(): CelebrationsApi {
  const [prCelebration, setPrCelebration] = useState<PrCelebrationState | null>(null)
  const prTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Dedup de la épica de PR: un mismo ejercicio no relanza toast+confeti por cada serie más pesada de la
  // sesión (respeta "1 épica máx" del contrato). Vive lo que dura el montaje del ejecutor (una sesión).
  const celebratedPrExercises = useRef<Set<string>>(new Set())

  useEffect(() => () => { if (prTimer.current) clearTimeout(prTimer.current) }, [])

  const fireHaptic = useCallback((tier: CelebrationTier) => {
    // Gate de la tuerca: la vibración se comparte con el cronómetro (device-scoped). OFF ⇒ sin haptic.
    if (!isRestTimerVibrationEnabled()) return
    if (tier === 'micro') void haptics.setDone()
    else if (tier === 'media') void haptics.success()
    else void haptics.pr() // épica: doble golpe (patrón pr de lib/haptics).
  }, [])

  const celebrate = useCallback(
    (event: WorkoutCelebrationEvent, ctx?: CelebrationContext): CelebrationTier | null => {
      const tier = celebrationTierFor(event, ctx)
      if (!tier) return null
      fireHaptic(tier)
      // Sonido de celebración: gateado por la tuerca (OFF por defecto). No-op hasta Ola 5 — RN aún no
      // tiene assets de celebración; se lee la preferencia igual para no cambiar el contrato al cablearlo.
      if (getExecSettings().celebrationSounds) {
        // TODO(Ola 5): reproducir el cue de audio del tier cuando exista el asset.
      }
      return tier
    },
    [fireHaptic],
  )

  const celebratePr = useCallback(
    (input: PrCelebrationInput): boolean => {
      // Haptic épico en CADA PR real (feedback táctil del récord), aunque el toast ya se haya mostrado.
      celebrate('pr_detectado', { isRealPR: true })
      if (celebratedPrExercises.current.has(input.exerciseId)) return false
      celebratedPrExercises.current.add(input.exerciseId)
      if (prTimer.current) clearTimeout(prTimer.current)
      setPrCelebration({ ...input, nonce: Date.now() })
      prTimer.current = setTimeout(() => setPrCelebration(null), PR_CELEBRATION_MS)
      return true
    },
    [celebrate],
  )

  const dismissPr = useCallback(() => {
    if (prTimer.current) clearTimeout(prTimer.current)
    setPrCelebration(null)
  }, [])

  return { celebrate, celebratePr, prCelebration, dismissPr }
}
