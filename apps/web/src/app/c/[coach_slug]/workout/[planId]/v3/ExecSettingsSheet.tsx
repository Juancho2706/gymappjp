'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { Flag, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { playTimerSound, type TimerSound } from '@/lib/audioUtils'
import {
  useRestTimerPreferences,
  readRestTimerMuted,
  writeRestTimerMuted,
} from '../rest-timer-preferences'
import { useExecSettings } from './exec-settings'

/**
 * Ejecutor V3 (E3.7) — sheet de la tuerca del entrenamiento. Traducción del mockup
 * `concepto-a-v3-tipos` (pantalla Ajustes): sonido del cronómetro, tono, volumen, vibración,
 * sonidos de celebración (OFF por diseño), mantener pantalla encendida y mostrar RPE/RIR.
 *
 * CABLEADO REAL (decisión CEO 3 — sólo el cronómetro suena):
 *  - Sonido del cronómetro → mute REAL del RestTimer (`rest-timer-preferences`).
 *  - Tono / Volumen        → catálogo Web Audio existente (digital/campana/clásico/boxeo + gain).
 *  - Vibración / Pantalla / Celebraciones / RPE-RIR → prefs device-scoped (`exec-settings`),
 *    consumidas por el RestTimer (háptico/WakeLock), el interstitial (celebración) y la sesión (RPE/RIR).
 *
 * Persiste device-scoped en localStorage; nada viaja al server. Se monta DENTRO del wrapper
 * [data-exec-v3] (acento --exec-brand ya resuelto), sin portal.
 */

interface ExecSettingsSheetProps {
  open: boolean
  onClose: () => void
  /** Cronómetro automático — el descanso arranca solo al guardar cada serie. La pref (`omni_autotimer`)
   *  es device-scoped y también la escribía la tuerca legacy (V2): QA1 retiró esta fila por fidelidad
   *  al mockup y un OFF heredado quedaba ATRAPADO sin UI para revertirlo (cronómetro muerto). Vuelve por
   *  decisión CEO 2026-07-25; con OFF la fila se pinta en rojo con aviso explícito. */
  autoTimerEnabled?: boolean
  onToggleAutoTimer?: () => void
  /** Finalizar entrenamiento — decisión CEO (2026-07-22): la barra fija "Finalizar" NO existe en V3, su
   *  acción se movió acá. Al presionar la fila se cierra el sheet y se dispara el MISMO handler de la
   *  barra (`handleFinish`: resumen inmediato + sincronización en background). Aditiva: si no se pasa,
   *  la fila no se pinta. */
  onFinish?: () => void
  /** Todas las series planificadas hechas ⇒ la fila "Finalizar" se enciende igual que la barra fija
   *  (relleno de marca + glow). Sin chispas: se remontarían en cada apertura del sheet. */
  finishArmed?: boolean
}

const TONE_OPTIONS: { value: TimerSound; label: string }[] = [
  { value: 'digital', label: 'Digital' },
  { value: 'bell', label: 'Campana' },
  { value: 'classic', label: 'Clásico' },
  { value: 'boxing', label: 'Boxeo' },
]

function Toggle({
  checked,
  onChange,
  label,
  danger = false,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  /** Estado de advertencia (apagado peligroso): tiñe el toggle de rojo. */
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('exec-v3-tog', checked && 'is-on')}
      style={danger && !checked ? { borderColor: 'rgba(248,113,113,0.7)', background: 'rgba(248,113,113,0.18)' } : undefined}
    >
      <span className="exec-v3-tog-knob" aria-hidden />
    </button>
  )
}

export function ExecSettingsSheet({
  open,
  onClose,
  autoTimerEnabled = true,
  onToggleAutoTimer,
  onFinish,
  finishArmed = false,
}: ExecSettingsSheetProps) {
  const reducedMotion = useReducedMotion()
  const { sound, volume, setSoundPersist, setVolumePersist } = useRestTimerPreferences()
  const { vibration, celebrations, keepAwake, showEffort, setVibration, setCelebrations, setKeepAwake, setShowEffort } =
    useExecSettings()
  // Sonido del cronómetro = NO silenciado (mute es la pref persistida real del RestTimer).
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    if (open) setSoundOn(!readRestTimerMuted())
  }, [open])

  const toggleSound = (next: boolean) => {
    setSoundOn(next)
    writeRestTimerMuted(!next) // muted = !soundOn
    if (next) playTimerSound(sound, volume) // preview al reactivar
  }

  const changeTone = (value: TimerSound) => {
    setSoundPersist(value)
    if (soundOn) playTimerSound(value, volume)
  }

  // P6 (EVA-NEXTJS-8): cada tick del drag disparaba un AudioContext nuevo (pico de "Failed to
  // start the audio device" en WebKit). El % y la barra siguen el dedo sin demora; el preview
  // de audio se debouncea 180ms trailing-edge.
  const volumePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (volumePreviewTimer.current) clearTimeout(volumePreviewTimer.current)
    }
  }, [])

  const changeVolume = (next: number) => {
    setVolumePersist(next)
    if (!soundOn) return
    if (volumePreviewTimer.current) clearTimeout(volumePreviewTimer.current)
    volumePreviewTimer.current = setTimeout(() => {
      playTimerSound(sound, next)
    }, 180)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Cerrar ajustes"
            onClick={onClose}
            className="exec-v3-sheet-scrim"
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
          />
          <motion.div
            className="exec-v3-settings"
            role="dialog"
            aria-modal="true"
            aria-label="Ajustes del entrenamiento"
            initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
            transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
          >
            <span className="exec-v3-handle" aria-hidden />
            <div className="exec-v3-settings-hd">
              <h2 className="exec-v3-settings-t">Ajustes del entrenamiento</h2>
              <button type="button" onClick={onClose} className="exec-v3-settings-x" aria-label="Cerrar">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="exec-v3-setrows">
              {/* Cronómetro automático — de vuelta en la tuerca (decisión CEO 2026-07-25): QA1 la retiró
                  por fidelidad al mockup y un `omni_autotimer` OFF heredado de la tuerca legacy quedaba
                  atrapado sin UI. OFF ⇒ fila roja + aviso: no habrá cronómetro de descanso. */}
              {onToggleAutoTimer && (
                <div className="exec-v3-setrow is-first">
                  <div className="exec-v3-setmain">
                    <div className="exec-v3-setname" style={autoTimerEnabled ? undefined : { color: '#f87171' }}>
                      Cronómetro automático
                    </div>
                    <div
                      className="exec-v3-setsub"
                      style={autoTimerEnabled ? undefined : { color: '#f87171', fontWeight: 700 }}
                      role={autoTimerEnabled ? undefined : 'alert'}
                    >
                      {autoTimerEnabled
                        ? 'El descanso empieza solo al guardar cada serie'
                        : 'No habrá cronómetro de descanso al guardar tus series'}
                    </div>
                  </div>
                  <Toggle
                    checked={autoTimerEnabled}
                    onChange={() => onToggleAutoTimer()}
                    label="Cronómetro automático"
                    danger={!autoTimerEnabled}
                  />
                </div>
              )}

              {/* Sonido del cronómetro (mute REAL del RestTimer). */}
              <div className={cn('exec-v3-setrow', !onToggleAutoTimer && 'is-first')}>
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Sonido del cronómetro</div>
                  <div className="exec-v3-setsub">Suena al terminar el descanso</div>
                </div>
                <Toggle checked={soundOn} onChange={toggleSound} label="Sonido del cronómetro" />
              </div>

              {/* Tono (catálogo Web Audio existente — REAL). */}
              <div className="exec-v3-setrow">
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Tono</div>
                  <div className="exec-v3-setsub">Campana · Digital · Clásico · Boxeo</div>
                </div>
                <select
                  value={sound}
                  onChange={(e) => changeTone(e.target.value as TimerSound)}
                  disabled={!soundOn}
                  aria-label="Tono del cronómetro"
                  className="exec-v3-selval"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Volumen (gain Web Audio existente — REAL). */}
              <div className="exec-v3-setrow is-slider">
                <div className="exec-v3-slidertop">
                  <div className="exec-v3-setname">Volumen</div>
                  <div className="exec-v3-pct tabular-nums">{Math.round(volume * 100)}%</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={volume}
                  disabled={!soundOn}
                  onChange={(e) => changeVolume(parseFloat(e.target.value))}
                  aria-label="Volumen del cronómetro"
                  className="exec-v3-range"
                  style={{ ['--exec-vol' as string]: `${Math.round(volume * 100)}%` }}
                />
              </div>

              {/* Vibración (háptico del descanso). */}
              <div className="exec-v3-setrow">
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Vibración</div>
                  <div className="exec-v3-setsub">Aviso háptico en la cuenta final</div>
                </div>
                <Toggle checked={vibration} onChange={setVibration} label="Vibración" />
              </div>

              {/* Sonidos de celebración — OFF por diseño (decisión CEO 3). */}
              <div className="exec-v3-setrow">
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Sonidos de celebración</div>
                  <div className="exec-v3-setsub">El resto de la app permanece en silencio</div>
                </div>
                <Toggle checked={celebrations} onChange={setCelebrations} label="Sonidos de celebración" />
              </div>

              {/* Mantener pantalla encendida (WakeLock del descanso). */}
              <div className="exec-v3-setrow">
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Mantener pantalla encendida</div>
                  <div className="exec-v3-setsub">Durante el descanso</div>
                </div>
                <Toggle checked={keepAwake} onChange={setKeepAwake} label="Mantener pantalla encendida" />
              </div>

              {/* Mostrar RPE/RIR en fuerza. */}
              <div className="exec-v3-setrow">
                <div className="exec-v3-setmain">
                  <div className="exec-v3-setname">Mostrar RPE/RIR en fuerza</div>
                  <div className="exec-v3-setsub">Oculta la sección de esfuerzo si lo prefieres</div>
                </div>
                <Toggle checked={showEffort} onChange={setShowEffort} label="Mostrar RPE/RIR en fuerza" />
              </div>
            </div>

            {/* Finalizar entrenamiento (decisión CEO 2026-07-22) — sección separada al final del sheet.
                Reemplaza la barra fija retirada en V3: cierra el sheet y dispara el MISMO handler de la
                barra (`onFinish` = handleFinish); si hay series sin sincronizar sigue mostrando su aviso. */}
            {onFinish && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1.5px solid #24242e' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onFinish()
                  }}
                  className={cn('active:scale-[0.99]', finishArmed && 'exec-v3-finish-armed')}
                  aria-label={finishArmed ? 'Entrenamiento completo. Finalizar entrenamiento' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 14,
                    // El relleno encendido va INLINE porque el botón se estiliza inline: una clase
                    // perdería frente a estas declaraciones.
                    border: finishArmed
                      ? '2px solid color-mix(in srgb, var(--exec-brand) 55%, #000)'
                      : '2px solid #2f2f3a',
                    background: finishArmed ? 'var(--exec-brand)' : '#1c1c24',
                    color: finishArmed ? 'var(--exec-brand-ink)' : '#e8e8ee',
                    fontSize: 14,
                    fontWeight: 800,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'transform 0.12s ease',
                  }}
                >
                  <Flag size={19} strokeWidth={2.4} style={{ flexShrink: 0 }} aria-hidden />
                  Finalizar entrenamiento
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
