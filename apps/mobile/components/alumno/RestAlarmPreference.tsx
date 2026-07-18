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

interface RestAlarmPreferenceProps {
  /**
   * Texto del eyebrow de sección. En el Perfil del alumno (E4-19) la card vive sola,
   * por eso el default se autodescribe ("Alarma de descanso"). Dentro del panel de
   * ajustes del ejecutor la sección ya está rotulada como "Alarma" en la web
   * (`WorkoutTimerSettingsPanel.tsx:95`, H3 = "Alarma"), así que ahí se pasa `eyebrow="Alarma"`
   * para paridad textual exacta con el panel web. El copy secundario coincide en ambos.
   */
  eyebrow?: string
}

export function RestAlarmPreference({ eyebrow = 'Alarma de descanso' }: RestAlarmPreferenceProps = {}) {
  const { theme } = useTheme()
  const { muted, sound, volume } = useSyncExternalStore(subscribeRestTimerPrefs, getSnapshot, getSnapshot)

  function toggleMuted() {
    haptics.select()
    setRestTimerMuted(!muted)
  }

  function pickSound(next: TimerSound) {
    // Espeja `handleSoundChange` web (`WorkoutTimerSettingsPanel.tsx:56-59`): persiste +
    // previsualiza SIEMPRE, sin gatear por mute (`force`) — en la web el mute no existe en el
    // panel (vive sólo en la barra), así que elegir un timbre siempre suena. NO toca el mute.
    setRestTimerSound(next)
    playTimerCue('alarm', { force: true })
  }

  function pickVolume(next: number) {
    setRestTimerVolume(next)
    // Previsualiza con el nuevo volumen SIEMPRE (espeja `handleVolumeChange` web, sin gate de mute).
    playTimerCue('alarm', { force: true })
  }

  function preview() {
    // Háptica siempre (feedback inmediato); audio por acción directa aun con mute (`force`),
    // igual que los previews del panel web. El mute silencia la ALARMA real, no la prueba.
    haptics.setDone()
    playTimerCue('alarm', { force: true })
  }

  return (
    <Card padding="lg" testID="rest-alarm-preference">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          {/* Eyebrow de sección (espeja el H3 web `WorkoutTimerSettingsPanel.tsx:95`:
              `text-xs font-bold uppercase tracking-widest text-muted-foreground`). */}
          <Text className="text-xs font-sans-bold uppercase tracking-[1.2px] text-muted">
            {eyebrow}
          </Text>
          <Text className="text-sm font-sans text-muted mt-1">
            Sonido y volumen cuando termina el descanso.
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

      {/* Sin dim por mute: elegir timbre siempre previsualiza (paridad web — el panel no
          gatea el preview por mute). El interruptor Silencio afecta la ALARMA real, no la prueba. */}
      <View className="mt-4">
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

      {/* "Probar sonido" suena SIEMPRE por acción directa (aun con mute), igual que los previews
          del panel web. No se deshabilita por mute — el mute silencia la alarma real del descanso. */}
      <HapticPressable
        testID="rest-alarm-preview"
        haptic="none"
        onPress={preview}
        className="mt-4 h-11 flex-row items-center justify-center gap-2 rounded-control border border-default"
      >
        <Volume2 size={16} color={theme.foreground} />
        <Text className="text-sm font-sans-semibold text-strong">Probar sonido</Text>
      </HapticPressable>
    </Card>
  )
}
