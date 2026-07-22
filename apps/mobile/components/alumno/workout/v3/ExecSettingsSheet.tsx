import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { LayoutChangeEvent, Platform, Pressable, Text, View } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { Sheet } from '../../../Sheet'
import {
  getRestTimerSound,
  getRestTimerVolume,
  isRestTimerMuted,
  isRestTimerSystemToneEnabled,
  isRestTimerVibrationEnabled,
  setRestTimerMuted,
  setRestTimerSound,
  setRestTimerSystemTone,
  setRestTimerVibration,
  setRestTimerVolume,
  subscribeRestTimerPrefs,
  type TimerSound,
} from '../timers'
import { playTimerCue } from '../timers/sound'
import { useExecSettings, setKeepAwake, setShowRpeRir, setCelebrationSounds } from './exec-settings'
import type { ExecTheme } from './exec-theme'

/**
 * Tuerca del ejecutor V3 (E3.7 · audio activado en Ola 5). Sheet con los ajustes del entrenamiento
 * (device-scoped), traduccion RN de la pantalla "Ajustes" del mockup concepto-a-v3-tipos.
 *
 * Ola 5: el motor de audio (`expo-audio` + `sound.ts`) YA está activo, así que las opciones de sonido
 * dejan de estar "próximamente" y controlan la preferencia REAL que consume el cronómetro:
 *   · Sonido del cronómetro → `restTimerMuted` (ON = suena la alarma; la vibración sigue aparte).
 *   · Tono → `restTimerSound` (catálogo digital/campana/clásico/boxeo) + "Del sistema" (E5.2, solo
 *     Android → `restTimerSystemTone`). Elegir un tono lo previsualiza (`playTimerCue('alarm', force)`).
 *   · Volumen → `restTimerVolume` (0..1). Mover previsualiza con el nuevo volumen.
 * Todos espejan la card `RestAlarmPreference` del perfil y el panel web `WorkoutTimerSettingsPanel`
 * (elegir tono/volumen SIEMPRE previsualiza, sin gatear por mute — el mute silencia la alarma real, no
 * la prueba directa del usuario). Siguen funcionales: Vibración, Sonidos de celebración (Ola 4),
 * Mantener pantalla encendida y Mostrar RPE/RIR.
 *
 * Persistencia AsyncStorage: sonido/tono/volumen/vibración/tono-sistema viven en `rest-timer-preferences`
 * (los consume el motor); keep-awake/RPE/celebración en `exec-settings` (useSyncExternalStore).
 */

const TONE_LABELS: Record<TimerSound, string> = {
  digital: 'Digital',
  bell: 'Campana',
  classic: 'Clásico',
  boxing: 'Boxeo',
}
const CATALOG_TONES: TimerSound[] = ['digital', 'bell', 'classic', 'boxing']
// Valor lógico del selector de tono: un timbre del catálogo o el tono del sistema (Android).
type ToneChoice = TimerSound | 'system'

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

  // Prefs del cronómetro (viven en `rest-timer-preferences`); suscribimos para reflejar cambios externos
  // (barra ↔ tuerca ↔ card del perfil).
  const [vibration, setVibrationState] = useState(isRestTimerVibrationEnabled())
  const [soundOn, setSoundOn] = useState(!isRestTimerMuted())
  const [tone, setTone] = useState<TimerSound>(getRestTimerSound())
  const [systemTone, setSystemToneState] = useState(isRestTimerSystemToneEnabled())
  const [volume, setVolumeState] = useState(getRestTimerVolume())
  // UI local: el selector de tono desplegado.
  const [toneOpen, setToneOpen] = useState(false)

  useEffect(() => {
    const sync = () => {
      setVibrationState(isRestTimerVibrationEnabled())
      setSoundOn(!isRestTimerMuted())
      setTone(getRestTimerSound())
      setSystemToneState(isRestTimerSystemToneEnabled())
      setVolumeState(getRestTimerVolume())
    }
    sync()
    return subscribeRestTimerPrefs(sync)
  }, [])

  // El tono del sistema solo aplica en Android; en iOS jamás se considera "activo".
  const isSystem = Platform.OS === 'android' && systemTone
  const currentToneLabel = isSystem ? 'Del sistema' : TONE_LABELS[tone]

  const pickTone = useCallback((choice: ToneChoice) => {
    void haptics.tap()
    if (choice === 'system') {
      setRestTimerSystemTone(true)
    } else {
      // `setRestTimerSound` ya limpia el tono del sistema (invariante catalogo ⇒ no-sistema).
      setRestTimerSound(choice)
    }
    // Previsualiza SIEMPRE por acción directa (aun con mute), espejo del panel web/`RestAlarmPreference`.
    playTimerCue('alarm', { force: true })
    setToneOpen(false)
  }, [])

  const pickVolume = useCallback((next: number) => {
    setRestTimerVolume(next)
    // Previsualiza con el nuevo volumen SIEMPRE (sin gate de mute), espejo de `handleVolumeChange` web.
    playTimerCue('alarm', { force: true })
  }, [])

  const s = exec.surface

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      forceDark
      snapPoints={['80%']}
      title="Ajustes del entrenamiento"
      accessibilityLabel="Ajustes del entrenamiento"
    >
      <View style={{ paddingBottom: 8 }}>
        {/* Sonido del cronómetro — controla `restTimerMuted`. ON = suena la alarma. */}
        <SettingRow
          exec={exec}
          name="Sonido del cronómetro"
          sublabel="La vibración sigue activa aunque lo apagues."
          first
          control={
            <Toggle
              testID="setting-sound"
              value={soundOn}
              exec={exec}
              accessibilityLabel="Sonido del cronómetro"
              onChange={(v) => {
                void haptics.tap()
                setRestTimerMuted(!v)
                setSoundOn(v)
              }}
            />
          }
        />

        {/* Tono — selector desplegable (catálogo + "Del sistema" en Android). */}
        <SettingRow
          exec={exec}
          name="Tono"
          control={
            <Pressable
              testID="setting-tone"
              onPress={() => { void haptics.tap(); setToneOpen((o) => !o) }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Tono de la alarma: ${currentToneLabel}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: s.surfaceRaised, borderColor: toneOpen ? hexToRgba(exec.accent, 0.6) : s.borderStrong }}
            >
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: s.text }}>{currentToneLabel}</Text>
              <ChevronDown size={14} color={s.textDim} style={{ transform: [{ rotate: toneOpen ? '180deg' : '0deg' }] }} />
            </Pressable>
          }
        />

        {toneOpen ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 }}>
            {CATALOG_TONES.map((t) => (
              <ToneChip
                key={t}
                label={TONE_LABELS[t]}
                selected={!isSystem && tone === t}
                onPress={() => pickTone(t)}
                exec={exec}
              />
            ))}
            {/* "Del sistema" — solo Android (iOS no expone el tono de alarma del SO). */}
            {Platform.OS === 'android' ? (
              <ToneChip
                testID="setting-tone-system"
                label="Del sistema"
                selected={isSystem}
                onPress={() => pickTone('system')}
                exec={exec}
              />
            ) : null}
          </View>
        ) : null}

        {/* Volumen — slider funcional (0..100%). */}
        <SettingRow
          exec={exec}
          name="Volumen"
          control={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 150 }}>
              <ExecVolumeSlider value={volume} onChange={pickVolume} exec={exec} />
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, width: 34, textAlign: 'right' }}>
                {Math.round(volume * 100)}%
              </Text>
            </View>
          }
        />

        {/* Vibración — funcional (pref del cronómetro). */}
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

/** Chip seleccionable del selector de tono (catálogo + "Del sistema"). */
function ToneChip({
  label,
  selected,
  onPress,
  exec,
  testID,
}: {
  label: string
  selected: boolean
  onPress: () => void
  exec: ExecTheme
  testID?: string
}) {
  const s = exec.surface
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1.5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: selected ? hexToRgba(exec.accent, 0.16) : s.surfaceRaised,
        borderColor: selected ? hexToRgba(exec.accent, 0.6) : s.borderStrong,
      }}
    >
      {selected ? <Check size={13} color={exec.accent} strokeWidth={2.6} /> : null}
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 12.5, color: selected ? exec.accent : s.textMuted }}>{label}</Text>
    </Pressable>
  )
}

/**
 * Slider de volumen dark-only del ejecutor (E5.1). Mismo modelo que la primitiva DS `Slider` (Gesture.Pan
 * + reanimated en UI thread, sin deps nativas nuevas), pero teñido con los tokens del ejecutor (`exec.accent`
 * / superficies fijas) para que no dependa del scheme del sistema dentro del sheet forceDark. Rango 0..1,
 * step 0.1 (paridad con el `<input type=range step=0.1>` web). `haptics.select()` en cada step.
 */
const VOL_THUMB = 20
const VOL_TRACK_H = 8
const VOL_MIN = 0
const VOL_MAX = 1
const VOL_STEP = 0.1

function clampVol(v: number, lo: number, hi: number): number {
  'worklet'
  return Math.min(Math.max(v, lo), hi)
}

function ExecVolumeSlider({
  value,
  onChange,
  exec,
}: {
  value: number
  onChange: (next: number) => void
  exec: ExecTheme
}) {
  const s = exec.surface
  const [trackW, setTrackW] = useState(0)
  const range = VOL_MAX - VOL_MIN
  const usable = useSharedValue(0)
  const thumbX = useSharedValue(0)
  const lastValue = useSharedValue(value)
  const dragging = useSharedValue(false)

  const posFor = (v: number, w: number) => (w > 0 ? ((v - VOL_MIN) / range) * (w - VOL_THUMB) : 0)

  useEffect(() => {
    lastValue.value = value
    if (!dragging.value && trackW > 0) {
      thumbX.value = withTiming(posFor(value, trackW), { duration: 120 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trackW])

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width
    setTrackW(w)
    usable.value = Math.max(w - VOL_THUMB, 0)
    thumbX.value = posFor(value, w)
  }

  const emit = useCallback((v: number) => {
    void haptics.select()
    onChange(v)
  }, [onChange])

  const applyX = (x: number) => {
    'worklet'
    const u = usable.value
    const left = clampVol(x - VOL_THUMB / 2, 0, u)
    thumbX.value = left
    const frac = u > 0 ? left / u : 0
    const raw = VOL_MIN + frac * range
    const snapped = clampVol(Math.round((raw - VOL_MIN) / VOL_STEP) * VOL_STEP + VOL_MIN, VOL_MIN, VOL_MAX)
    if (Math.abs(snapped - lastValue.value) > 1e-6) {
      lastValue.value = snapped
      runOnJS(emit)(snapped)
    }
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      dragging.value = true
      applyX(e.x)
    })
    .onUpdate((e) => {
      applyX(e.x)
    })
    .onFinalize(() => {
      dragging.value = false
      const u = usable.value
      thumbX.value = withTiming(u > 0 ? ((lastValue.value - VOL_MIN) / range) * u : 0, { duration: 100 })
    })

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }))
  const fillStyle = useAnimatedStyle(() => ({ width: thumbX.value + VOL_THUMB / 2 }))

  return (
    <GestureDetector gesture={pan}>
      <View
        style={{ flex: 1, height: VOL_THUMB, justifyContent: 'center' }}
        onLayout={onLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Volumen del cronómetro"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const cur = value
          if (e.nativeEvent.actionName === 'increment') emit(clampVol(Math.round((cur + VOL_STEP) / VOL_STEP) * VOL_STEP, VOL_MIN, VOL_MAX))
          else if (e.nativeEvent.actionName === 'decrement') emit(clampVol(Math.round((cur - VOL_STEP) / VOL_STEP) * VOL_STEP, VOL_MIN, VOL_MAX))
        }}
      >
        <View style={{ height: VOL_TRACK_H, borderRadius: 999, backgroundColor: s.surfaceRaised, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: exec.accent }, fillStyle]} />
        </View>
        <Animated.View
          style={[
            { position: 'absolute', left: 0, width: VOL_THUMB, height: VOL_THUMB, borderRadius: VOL_THUMB / 2, backgroundColor: exec.accentText, borderWidth: 2, borderColor: exec.accent },
            thumbStyle,
          ]}
        />
      </View>
    </GestureDetector>
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
