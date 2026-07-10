import { useSyncExternalStore } from 'react'
import { View, Text } from 'react-native'
import { Volume2, VolumeX } from 'lucide-react-native'
import { Card } from '../Card'
import { SegmentedTabs } from '../SegmentedTabs'
import { HapticPressable } from '../HapticPressable'
import { Slider } from '../Slider'
import { useTheme } from '../../context/ThemeContext'
import { haptics } from '../../lib/haptics'
import {
  subscribeRestTimerPrefs,
  isRestTimerMuted,
  setRestTimerMuted,
  getRestTimerSound,
  setRestTimerSound,
  getRestTimerVolume,
  setRestTimerVolume,
  type TimerSound,
} from './workout/timers'
import { playTimerCue } from './workout/timers/sound'

/**
 * E4-19 — Preferencia "Alarma de descanso" para el Perfil del alumno.
 *
 * Card de ajuste que expone la MISMA preferencia persistida que usan los timers
 * del ejecutor (`rest-timer-preferences.ts`: `restTimerMuted` / `restTimerSound`
 * en AsyncStorage). NO duplica estado: lee/escribe el cache compartido vía los
 * getters/setters del módulo y se re-renderiza con `subscribeRestTimerPrefs`
 * (misma suscripción que la barra de descanso), así el panel y la barra quedan
 * siempre sincronizados.
 *
 * - Selector de sonido (4 cues) + interruptor Silencio (mutea el canal de audio;
 *   la háptica sigue sonando — es el canal primario en móvil, ver `sound.ts`).
 * - Botón "Probar" reproduce el cue actual (`playTimerCue('alarm')`, no-op seguro
 *   hasta que se bundlee el asset de audio) reforzado con háptica inmediata.
 *
 * Default = comportamiento web: sonido ON, `digital`.
 */

const SOUND_ITEMS: { value: TimerSound; label: string }[] = [
  { value: 'digital', label: 'Digital' },
  { value: 'bell', label: 'Campana' },
  { value: 'classic', label: 'Clásico' },
  { value: 'boxing', label: 'Boxeo' },
]

// Snapshot combinado para useSyncExternalStore. Se memoiza por igualdad de
// campos para no forzar renders (el store notifica en cada set).
let snapCache = { muted: isRestTimerMuted(), sound: getRestTimerSound(), volume: getRestTimerVolume() }
function getSnapshot() {
  const muted = isRestTimerMuted()
  const sound = getRestTimerSound()
  const volume = getRestTimerVolume()
  if (snapCache.muted !== muted || snapCache.sound !== sound || snapCache.volume !== volume) {
    snapCache = { muted, sound, volume }
  }
  return snapCache
}

export function RestAlarmPreference() {
  const { theme } = useTheme()
  const { muted, sound, volume } = useSyncExternalStore(subscribeRestTimerPrefs, getSnapshot, getSnapshot)

  function toggleMuted() {
    haptics.select()
    setRestTimerMuted(!muted)
  }

  function pickSound(next: TimerSound) {
    setRestTimerSound(next)
    // Al elegir un sonido con Silencio activo, lo desactivamos (intención clara).
    if (muted) setRestTimerMuted(false)
    // Previsualiza el timbre elegido (espeja `handleSoundChange` web → playTimerSound).
    playTimerCue('alarm')
  }

  function pickVolume(next: number) {
    setRestTimerVolume(next)
    // Previsualiza con el nuevo volumen (espeja `handleVolumeChange` web).
    playTimerCue('alarm')
  }

  function preview() {
    // Háptica siempre (feedback inmediato); audio si hay asset + no muteado.
    haptics.setDone()
    playTimerCue('alarm')
  }

  const enabled = !muted

  return (
    <Card padding="lg" testID="rest-alarm-preference">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-sans-semibold text-strong">Alarma de descanso</Text>
          <Text className="text-sm font-sans text-muted mt-1">
            Sonido al terminar el descanso entre series.
          </Text>
        </View>
        <HapticPressable
          testID="rest-alarm-mute-toggle"
          haptic="none"
          onPress={toggleMuted}
          accessibilityRole="switch"
          accessibilityState={{ checked: muted }}
          accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-sunken"
        >
          {muted ? (
            <VolumeX size={18} color={theme.mutedForeground} />
          ) : (
            <Volume2 size={18} color={theme.primary} />
          )}
        </HapticPressable>
      </View>

      <View className="mt-4" style={{ opacity: enabled ? 1 : 0.45 }}>
        <SegmentedTabs
          items={SOUND_ITEMS}
          value={sound}
          onChange={pickSound}
          size="sm"
        />
      </View>

      <View className="mt-4">
        <View className="flex-row items-center gap-1.5 mb-2">
          <Volume2 size={14} color={theme.mutedForeground} />
          <Text className="text-xs font-sans text-muted">Volumen</Text>
        </View>
        <Slider
          testID="rest-alarm-volume"
          min={0}
          max={1}
          step={0.1}
          value={volume}
          onValueChange={pickVolume}
          renderValue={(v) => (
            <Text className="text-xs font-sans-semibold text-muted">{Math.round(v * 100)}%</Text>
          )}
        />
      </View>

      <HapticPressable
        testID="rest-alarm-preview"
        haptic="none"
        onPress={preview}
        disabled={muted}
        className="mt-4 h-11 flex-row items-center justify-center gap-2 rounded-control border border-default"
        style={{ opacity: muted ? 0.45 : 1 }}
      >
        <Volume2 size={16} color={theme.foreground} />
        <Text className="text-sm font-sans-semibold text-strong">Probar sonido</Text>
      </HapticPressable>
    </Card>
  )
}
