import { useSyncExternalStore } from 'react'
import { Text, View } from 'react-native'
import { Card } from '../../Card'
import { Sheet } from '../../Sheet'
import { Switch } from '../../Switch'
import { RestAlarmPreference } from '../RestAlarmPreference'
import { isRestAutoTimerEnabled, setRestAutoTimerEnabled, subscribeRestTimerPrefs } from './timers'

/**
 * Ajustes del ejecutor (WAVE-B-SEAM) — espejo del `WorkoutTimerSettingsPanel` web.
 *
 * Dos secciones, ambas sobre las MISMAS preferencias persistidas que usa el timer
 * (`rest-timer-preferences.ts`, cero duplicación):
 *  1. Cronómetro automático — toggle `omni_autotimer` (default ON): si está
 *     activado, el descanso arranca solo al guardar cada serie.
 *  2. Alarma de descanso — reutiliza `<RestAlarmPreference />` (mute + sonido +
 *     previsualización), el mismo card del Perfil del alumno.
 *
 * El toggle se re-renderiza vía `subscribeRestTimerPrefs` (misma suscripción que
 * la barra de descanso y el card de alarma), así panel ↔ timer quedan siempre
 * sincronizados.
 */
export function WorkoutSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const autoTimer = useSyncExternalStore(subscribeRestTimerPrefs, isRestAutoTimerEnabled, isRestAutoTimerEnabled)

  return (
    <Sheet open={open} onClose={onClose} title="Ajustes del entrenamiento">
      <Card padding="lg" testID="workout-autotimer-setting">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-sans-semibold text-strong">Cronómetro automático</Text>
            <Text className="text-sm font-sans text-muted mt-1">
              Si está activado, el descanso empieza solo al guardar cada serie.
            </Text>
          </View>
          <Switch value={autoTimer} onValueChange={setRestAutoTimerEnabled} />
        </View>
      </Card>

      <RestAlarmPreference />
    </Sheet>
  )
}
