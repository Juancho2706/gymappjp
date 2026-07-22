'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
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
  /** Auto-cronómetro: se conserva por compatibilidad con el call-site del motor. Su control YA no vive
   *  en esta tuerca (no está en el mockup ni en RN) — el toggle real está en la pista de descanso. */
  autoTimerEnabled?: boolean
  onToggleAutoTimer?: () => void
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
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('exec-v3-tog', checked && 'is-on')}
    >
      <span className="exec-v3-tog-knob" aria-hidden />
    </button>
  )
}

export function ExecSettingsSheet({
  open,
  onClose,
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

  const changeVolume = (next: number) => {
    setVolumePersist(next)
    if (soundOn) playTimerSound(sound, next)
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
              {/* Sonido del cronómetro (mute REAL del RestTimer). Primera fila (mockup: sin "Cronómetro
                  automático" — ese toggle vive en la pista de descanso, no en la tuerca). */}
              <div className="exec-v3-setrow is-first">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
