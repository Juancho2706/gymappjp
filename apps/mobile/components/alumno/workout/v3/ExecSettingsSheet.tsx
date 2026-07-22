import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { Sheet } from '../../../Sheet'
import {
  isRestTimerVibrationEnabled,
  setRestTimerVibration,
  subscribeRestTimerPrefs,
} from '../timers'
import { useExecSettings, setKeepAwake, setShowRpeRir, setCelebrationSounds } from './exec-settings'
import type { ExecTheme } from './exec-theme'

// Sublabel comun de las opciones de audio que dependen de expo-audio (llegan en Ola 5).
const AUDIO_PENDING_SUBLABEL = 'Llega con la próxima actualización'

/**
 * Tuerca del ejecutor V3 (E3.7) — reemplaza el placeholder de la Ola 2. Sheet con los ajustes del
 * entrenamiento (device-scoped), traduccion RN de la pantalla "Ajustes" del mockup concepto-a-v3-tipos.
 *
 * Decision CEO (sonido): todo OFF salvo el cronometro. En RN las opciones que dependen de `expo-audio`
 * (Sonido del cronometro / Tono / Volumen) van VISIBLES pero DESHABILITADAS con el sublabel "Llega con
 * la proxima actualizacion" (el motor de audio llega en Ola 5). Ya funcionan: Vibracion (pref real
 * consumida por el cronometro), Sonidos de celebracion (pref para Ola 4), Mantener pantalla encendida
 * (condiciona el keep-awake) y Mostrar RPE/RIR (oculta las pills de esfuerzo en la pantalla de fuerza).
 *
 * Persistencia AsyncStorage: vibracion vive en `rest-timer-preferences` (la consume el motor); el resto
 * en `exec-settings` (useSyncExternalStore).
 */
export function ExecSettingsSheet({
  open,
  onClose,
  exec,
}: {
  open: boolean
  onClose: () => void
  exec: ExecTheme
}) {
  const settings = useExecSettings()

  // Vibracion vive en las prefs del cronometro; suscribimos para reflejar cambios externos (barra ↔ tuerca).
  const [vibration, setVibrationState] = useState(isRestTimerVibrationEnabled())
  useEffect(() => {
    setVibrationState(isRestTimerVibrationEnabled())
    return subscribeRestTimerPrefs(() => setVibrationState(isRestTimerVibrationEnabled()))
  }, [])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      forceDark
      snapPoints={['75%']}
      title="Ajustes del entrenamiento"
      accessibilityLabel="Ajustes del entrenamiento"
    >
      <View style={{ paddingBottom: 8 }}>
        {/* Sonido del cronometro — deshabilitado (motor de audio en Ola 5). */}
        <SettingRow
          exec={exec}
          name="Sonido del cronómetro"
          sublabel={AUDIO_PENDING_SUBLABEL}
          first
          control={<Toggle testID="setting-sound" value={false} disabled onChange={() => {}} exec={exec} accessibilityLabel="Sonido del cronómetro" />}
        />

        {/* Tono — deshabilitado. */}
        <SettingRow
          exec={exec}
          name="Tono"
          sublabel={AUDIO_PENDING_SUBLABEL}
          control={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: exec.surface.surfaceRaised, borderColor: exec.surface.borderStrong, opacity: 0.5 }}>
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: exec.surface.textMuted }}>Del sistema</Text>
              <ChevronDown size={14} color={exec.surface.textDim} />
            </View>
          }
        />

        {/* Volumen — deshabilitado (barra estatica). */}
        <SettingRow
          exec={exec}
          name="Volumen"
          sublabel={AUDIO_PENDING_SUBLABEL}
          control={
            <View style={{ width: 96, opacity: 0.5 }}>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: exec.surface.surfaceRaised, overflow: 'hidden' }}>
                <View style={{ width: '70%', height: '100%', borderRadius: 999, backgroundColor: exec.surface.textDim }} />
              </View>
            </View>
          }
        />

        {/* Vibracion — funcional (pref del cronometro). */}
        <SettingRow
          exec={exec}
          name="Vibración"
          control={
            <Toggle
              testID="setting-vibration"
              value={vibration}
              exec={exec}
              accessibilityLabel="Vibración del cronómetro"
              onChange={(v) => {
                void haptics.tap()
                setRestTimerVibration(v)
                setVibrationState(v)
              }}
            />
          }
        />

        {/* Sonidos de celebracion — funcional (pref para Ola 4), OFF por default. */}
        <SettingRow
          exec={exec}
          name="Sonidos de celebración"
          sublabel="El resto de la app permanece en silencio"
          control={
            <Toggle
              testID="setting-celebration"
              value={settings.celebrationSounds}
              exec={exec}
              accessibilityLabel="Sonidos de celebración"
              onChange={(v) => { void haptics.tap(); setCelebrationSounds(v) }}
            />
          }
        />

        {/* Mantener pantalla encendida — funcional (condiciona el keep-awake). */}
        <SettingRow
          exec={exec}
          name="Mantener pantalla encendida"
          control={
            <Toggle
              testID="setting-keepawake"
              value={settings.keepAwake}
              exec={exec}
              accessibilityLabel="Mantener pantalla encendida"
              onChange={(v) => { void haptics.tap(); setKeepAwake(v) }}
            />
          }
        />

        {/* Mostrar RPE/RIR en fuerza — funcional (oculta las pills de esfuerzo). */}
        <SettingRow
          exec={exec}
          name="Mostrar RPE/RIR en fuerza"
          control={
            <Toggle
              testID="setting-rpe-rir"
              value={settings.showRpeRir}
              exec={exec}
              accessibilityLabel="Mostrar RPE y RIR en fuerza"
              onChange={(v) => { void haptics.tap(); setShowRpeRir(v) }}
            />
          }
        />
      </View>
    </Sheet>
  )
}

function SettingRow({
  exec,
  name,
  sublabel,
  control,
  first = false,
}: {
  exec: ExecTheme
  name: string
  sublabel?: string
  control: ReactNode
  first?: boolean
}) {
  const s = exec.surface
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1.5,
        borderTopColor: s.borderSubtle,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, letterSpacing: -0.1, color: s.text }}>{name}</Text>
        {sublabel ? (
          <Text style={{ fontFamily: FONT.uiMedium, fontSize: 12, color: s.textMuted, marginTop: 3, lineHeight: 16 }}>{sublabel}</Text>
        ) : null}
      </View>
      {control}
    </View>
  )
}

/** Toggle estilo mockup (48×28, knob 18). Deshabilitado ⇒ atenuado y sin accion. Target >=44px via hitSlop. */
function Toggle({
  value,
  onChange,
  exec,
  disabled = false,
  testID,
  accessibilityLabel,
}: {
  value: boolean
  onChange: (v: boolean) => void
  exec: ExecTheme
  disabled?: boolean
  testID?: string
  accessibilityLabel?: string
}) {
  const s = exec.surface
  return (
    <Pressable
      testID={testID}
      onPress={() => { if (!disabled) onChange(!value) }}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: 48,
        height: 28,
        borderRadius: 999,
        borderWidth: 2,
        justifyContent: 'center',
        paddingHorizontal: 3,
        backgroundColor: value ? exec.accent : s.surfaceRaised,
        borderColor: value ? hexToRgba(exec.accent, 0.6) : s.borderStrong,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: value ? exec.accentText : s.textMuted,
          alignSelf: value ? 'flex-end' : 'flex-start',
        }}
      />
    </Pressable>
  )
}
