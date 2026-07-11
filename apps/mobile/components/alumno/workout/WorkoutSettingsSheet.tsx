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
import { haptics } from '../../../lib/haptics'
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

  // Alternar tocando la FILA COMPLETA (paridad web `WorkoutTimerSettingsPanel.tsx:75-91`: el
  // toggle es un `<button w-full ...>` cuyo `onClick` alterna al tocar cualquier parte de la fila,
  // incluida la etiqueta "Activado/Desactivado"). Antes en RN solo el `<Switch>` pequeño alternaba.
  // `haptics.select()` iguala el feedback del Switch (que ya lo dispara en su propio onValueChange).
  const toggleAutoTimer = () => {
    void haptics.select()
    setRestAutoTimerEnabled(!autoTimer)
  }

  return (
    // Sizing content-hug con tope + scroll = paridad EXACTA con el `<DialogContent>` web
    // (`WorkoutExecutionClient.tsx:1964`: `max-h-[min(90dvh,32rem)] overflow-y-auto`, sin altura fija):
    // el diálogo web abraza su contenido y solo scrollea al pasar el tope. El default del `Sheet` son
    // snapPoints FIJOS en porcentaje (`['45%','85%']`), que además de divergir del web dependen de que
    // @gorhom mida la altura del contenedor animado; bajo el stack actual (@gorhom v5 + reanimated v4)
    // esa medición de porcentaje puede resolver a 0 → el sheet se "presenta" con altura nula y parece
    // que la tuerca no abre nada (QA-2). `dynamicSizing` mide el CONTENIDO (vía onContentSizeChange),
    // el mismo camino robusto que ya usa el SubstituteExerciseSheet del ejecutor. Tope 90% = lado
    // `90dvh` del `min()` web; contenido corto abraza como el `h-auto` web.
    <Sheet open={open} onClose={onClose} title="Descanso y alarma" dynamicSizing snapPoints={['90%']}>
      {/* Card presionable = objetivo táctil de fila completa (paridad web). El `<Switch>` interno
          sigue siendo interactivo: al tocarlo, él (responder más interno) gana el gesto y alterna vía
          su `onValueChange`, así que el `onPress` de la Card NO se dispara también → sin doble toggle;
          tocar el texto o el resto de la fila dispara el `onPress` de la Card. */}
      <Card
        padding="lg"
        testID="workout-autotimer-setting"
        onPress={toggleAutoTimer}
        accessibilityRole="switch"
        accessibilityState={{ checked: autoTimer }}
        accessibilityLabel={`Cronómetro automático, ${autoTimer ? 'activado' : 'desactivado'}`}
      >
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
            {/* El Switch queda VISIBLE y presionable (tocarlo también alterna vía onValueChange),
                pero oculto para lectores de pantalla: la Card ya expone el rol `switch` con su estado,
                así hay UN solo control accesible (evita anunciar dos switches anidados). */}
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Switch value={autoTimer} onValueChange={setRestAutoTimerEnabled} />
            </View>
          </View>
        </View>
      </Card>

      {/* Eyebrow "Alarma" para paridad textual con el H3 de la sección B del panel web
          (`WorkoutTimerSettingsPanel.tsx:95`: H3 = "Alarma"). El card reutilizado del Perfil
          usa por default "Alarma de descanso" cuando vive solo; aquí se sobreescribe. */}
      <RestAlarmPreference eyebrow="Alarma" />

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

  // Paleta: la web usa la rampa `amber` cruda de Tailwind (`WorkoutTimerSettingsPanel.tsx:131`:
  // `border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200`). El DS de RN NO define
  // token `amber` (solo `warning`, ver `global.css`), y `global.css`/`tailwind.config.js` son
  // intocables aquí. Se mapea a la rampa `warning` del DS, cromáticamente equivalente y token-safe (NO
  // hardcodear amber crudo): warning-500 #F5A524 ≈ amber-500 #F59E0B; warning-700 light #8F5A05 ≈
  // amber-800; warning-700 dark #FFD489 ≈ amber-200. Mapeo de DS intencional y verificado, no un hex
  // mágico. Si el DS añade una rampa `amber`, migrar aquí (border/bg/text) + `BellRing`/`WARNING_500`.
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
