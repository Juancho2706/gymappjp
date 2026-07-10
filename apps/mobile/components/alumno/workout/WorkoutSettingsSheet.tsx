import { useEffect, useState, useSyncExternalStore } from 'react'
import { Text, View } from 'react-native'
import { BellRing } from 'lucide-react-native'
import { Card } from '../../Card'
import { Sheet } from '../../Sheet'
import { Switch } from '../../Switch'
import { HapticPressable } from '../../HapticPressable'
import { RestAlarmPreference } from '../RestAlarmPreference'
import { isRestAutoTimerEnabled, setRestAutoTimerEnabled, subscribeRestTimerPrefs } from './timers'
import { WARNING_500 } from './timers/timer-colors'
import {
  getRestNotifPermission,
  requestRestNotifPermission,
  type RestNotifPermission,
} from './timers/rest-notification'

/**
 * Ajustes del ejecutor (WAVE-B-SEAM) — espejo del `WorkoutTimerSettingsPanel` web.
 *
 * Tres secciones, todas sobre las MISMAS preferencias persistidas que usa el timer
 * (`rest-timer-preferences.ts`, cero duplicación):
 *  1. Cronómetro automático — toggle `omni_autotimer` (default ON): si está
 *     activado, el descanso arranca solo al guardar cada serie.
 *  2. Alarma de descanso — reutiliza `<RestAlarmPreference />` (mute + sonido +
 *     volumen + previsualización), el mismo card del Perfil del alumno.
 *  3. Permiso de notificaciones (§7 C web) — card de recuperación: si el alumno
 *     negó el permiso o aún no lo decidió, ofrece re-activarlo (o explica cómo
 *     desbloquearlo en Ajustes del SO); si ya está concedido, no muestra nada.
 *
 * El toggle se re-renderiza vía `subscribeRestTimerPrefs` (misma suscripción que
 * la barra de descanso y el card de alarma), así panel ↔ timer quedan siempre
 * sincronizados.
 */
export function WorkoutSettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const autoTimer = useSyncExternalStore(subscribeRestTimerPrefs, isRestAutoTimerEnabled, isRestAutoTimerEnabled)

  return (
    <Sheet open={open} onClose={onClose} title="Descanso y alarma">
      <Card padding="lg" testID="workout-autotimer-setting">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            {/* Eyebrow de sección (espeja el H3 web `WorkoutTimerSettingsPanel.tsx:69-71`:
                `text-xs font-bold uppercase tracking-widest text-muted-foreground`). */}
            <Text className="text-xs font-sans-bold uppercase tracking-[1.2px] text-muted">
              Cronómetro automático
            </Text>
            <Text className="text-sm font-sans text-muted mt-1">
              Si está activado, el descanso empieza solo al guardar cada serie.
            </Text>
          </View>
          {/* Etiqueta de estado "Activado/Desactivado" a la izquierda del control (paridad web
              WorkoutTimerSettingsPanel.tsx:80: <span font-semibold>{autoTimerEnabled ? 'Activado' :
              'Desactivado'}</span>). El control es el `<Switch>` DS idiomático (equivalente RN del
              track/perilla animado del web); la etiqueta preserva el texto de estado que el usuario ve. */}
          <View className="flex-row items-center gap-2">
            <Text className="text-sm font-sans-semibold text-strong">
              {autoTimer ? 'Activado' : 'Desactivado'}
            </Text>
            <Switch value={autoTimer} onValueChange={setRestAutoTimerEnabled} />
          </View>
        </View>
      </Card>

      <RestAlarmPreference />

      <NotificationPermissionCard />
    </Sheet>
  )
}

/**
 * Card de permiso de notificaciones (espejo §7 C web). El permiso NUNCA se pide
 * automáticamente (la barra no promptea, paridad web): este card es el ÚNICO punto
 * de prompt interactivo (`requestRestNotifPermission` tras "Activar permisos"),
 * espejando el botón del panel web. Re-pide si está en `default`, o explica el
 * desbloqueo por Ajustes del SO si quedó `denied`. `null` = cargando (evita el flash
 * del card antes de leer el permiso real, igual que el web).
 */
function NotificationPermissionCard() {
  const [permission, setPermission] = useState<RestNotifPermission | null>(null)

  useEffect(() => {
    let alive = true
    void getRestNotifPermission().then((p) => {
      if (alive) setPermission(p)
    })
    return () => {
      alive = false
    }
  }, [])

  async function handleRequest() {
    setPermission(await requestRestNotifPermission())
  }

  // Concedido o aún cargando → nada que mostrar.
  if (permission === null || permission === 'granted') return null

  if (permission === 'unsupported') {
    return (
      <Text className="text-xs font-sans text-muted">
        Este dispositivo no soporta notificaciones; mantén la app abierta para oír la alarma.
      </Text>
    )
  }

  return (
    <View className="flex-row gap-3 rounded-2xl border border-warning-500/25 bg-warning-500/10 p-4">
      <BellRing size={16} color={WARNING_500} style={{ marginTop: 2 }} />
      <View className="flex-1">
        <Text className="text-sm font-sans-semibold text-warning-700 mb-1">Alertas en segundo plano</Text>
        {permission === 'default' ? (
          <>
            <Text className="text-xs font-sans text-warning-700 mb-2">
              Activa las notificaciones para avisarte si bloqueas la pantalla o cambias de app.
            </Text>
            <HapticPressable
              testID="rest-notif-request"
              onPress={handleRequest}
              accessibilityRole="button"
              accessibilityLabel="Activar permisos de notificación"
              className="self-start h-8 items-center justify-center rounded-control border border-warning-500/40 bg-warning-500/5 px-3"
            >
              <Text className="text-xs font-sans-semibold text-warning-700">Activar permisos</Text>
            </HapticPressable>
          </>
        ) : (
          <Text className="text-xs font-sans text-warning-700">
            Las notificaciones están bloqueadas. Actívalas en Ajustes del sistema (Notificaciones) para
            recibir el aviso de fin de descanso.
          </Text>
        )}
      </View>
    </View>
  )
}
