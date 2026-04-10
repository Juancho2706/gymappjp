'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BellRing, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { playTimerSound } from '@/lib/audioUtils'
import type { TimerSound } from '@/lib/audioUtils'
import { BRAND_APP_ICON } from '@/lib/brand-assets'
import { useRestTimerPreferences } from './rest-timer-preferences'

interface WorkoutTimerSettingsPanelProps {
  autoTimerEnabled: boolean
  onToggleAutoTimer: () => void
}

export function WorkoutTimerSettingsPanel({
  autoTimerEnabled,
  onToggleAutoTimer,
}: WorkoutTimerSettingsPanelProps) {
  const { sound, volume, setSoundPersist, setVolumePersist } = useRestTimerPreferences()
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) {
      setNotificationsGranted(null)
      return
    }
    setNotificationsGranted(Notification.permission === 'granted')
  }, [])

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    setNotificationsGranted(permission === 'granted')
    if (permission === 'granted') {
      new Notification('¡Notificaciones activadas!', {
        body: 'El cronómetro te avisará cuando termine el descanso.',
        icon: BRAND_APP_ICON,
      })
    }
  }

  const handleSoundChange = (type: TimerSound) => {
    setSoundPersist(type)
    playTimerSound(type, volume)
  }

  const handleVolumeChange = (next: number) => {
    setVolumePersist(next)
    playTimerSound(sound, next)
  }

  return (
    <div className="mt-2 space-y-6">
      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
          Cronómetro automático
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Si está activado, el descanso empieza solo al guardar cada serie.
        </p>
        <button
          type="button"
          onClick={onToggleAutoTimer}
          className="w-full flex items-center justify-between p-4 rounded-2xl border border-border bg-secondary/50 hover:bg-secondary transition-colors"
        >
          <span className="font-semibold">{autoTimerEnabled ? 'Activado' : 'Desactivado'}</span>
          <div
            className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${autoTimerEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            style={autoTimerEnabled ? { backgroundColor: 'var(--theme-primary)' } : undefined}
          >
            <motion.div
              className="w-5 h-5 bg-white rounded-full shadow-sm"
              animate={{ x: autoTimerEnabled ? 20 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </div>
        </button>
      </section>

      <section>
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Alarma</h3>
        <p className="text-sm text-muted-foreground mb-3">Sonido y volumen cuando termina el descanso.</p>
        <div className="space-y-3 rounded-2xl border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground shrink-0">Sonido</label>
            <select
              value={sound}
              onChange={(e) => handleSoundChange(e.target.value as TimerSound)}
              className="min-w-0 flex-1 max-w-[11rem] bg-background border rounded-lg px-2 py-1.5 text-xs"
            >
              <option value="digital">Digital</option>
              <option value="bell">Campana</option>
              <option value="classic">Clásico</option>
              <option value="boxing">Boxeo</option>
            </select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 shrink-0">
              <Volume2 className="w-3.5 h-3.5" />
              Volumen
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="flex-1 max-w-[10rem] accent-primary"
              style={{ accentColor: 'var(--theme-primary, #007AFF)' }}
            />
          </div>
        </div>
      </section>

      {notificationsGranted === false && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 flex gap-3 text-xs text-amber-800 dark:text-amber-200">
          <BellRing className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Alertas en segundo plano</p>
            <p className="mb-2 opacity-90">
              Activa las notificaciones para avisos si bloqueas la pantalla o cambias de app.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/15"
              onClick={requestNotificationPermission}
            >
              Activar permisos
            </Button>
          </div>
        </section>
      )}

      {notificationsGranted === null && (
        <p className="text-xs text-muted-foreground">
          Este navegador no soporta notificaciones; mantén la app visible para oír la alarma.
        </p>
      )}
    </div>
  )
}
