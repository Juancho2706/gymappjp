import { useEffect, useRef, useState } from 'react'
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Check, Droplets, Footprints, HeartPulse, Moon, Smartphone } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Easing } from 'react-native-reanimated'
import { cssInterop } from 'nativewind'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getDailyHabits, upsertDailyHabits, type HabitsData } from '../../../lib/habits.queries'
import {
  isHealthAvailable,
  nearestSleepOption,
  readLastNightSleepHours,
  readTodaySteps,
  requestHealthPermissions,
} from '../../../lib/health-aggregators'
import { getHealthOptIn, setHealthOptIn } from '../../../lib/health-prefs'
import { toast } from '../../Toast'
import { Card } from '../../Card'

// NativeWind maneja el `color` del glyph via clases `text-*` (patron DS, ver
// tools.tsx) → aqua-700 (rampa fija) y sport-600 (marca white-label) resuelven
// dark-aware en runtime, sin hardcodear hex.
cssInterop(Droplets, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Footprints, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Smartphone, { className: { target: 'style', nativeStyleToProp: { color: true } } })

// Placeholder del input Pasos = `placeholder:text-subtle` web (HabitsCard.tsx:171);
// valores del token --text-subtle por esquema (globals.css:448/641).
const TEXT_SUBTLE = { light: '#646F7D', dark: '#86919E' } as const

const WATER_OPTIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000]
const WATER_TARGET = 3000
const SLEEP_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9]
const FASTING_DEFAULT_H = 16
const SUPPLEMENTS_GENERIC = 'Suplementos'

/**
 * §11 HabitsCard (web `habits/HabitsCard.tsx`, ruling D4: los habitos viven en el
 * dashboard como en web). Agua (barra 3L + chips quick-add), Pasos (input), Sueño
 * (7 chips full-width), Ayuno + Suplementos (2 toggles). Solo editable el dia de
 * hoy. Persiste con `upsertDailyHabits` (optimista); en error → toast (web :72).
 * El titulo de seccion "Hábitos de hoy" (accent aqua-700) lo pone el shell.
 */
export function HabitsCard({ clientId, logDate, isToday, initialData }: { clientId: string; logDate: string; isToday: boolean; initialData: HabitsData | null }) {
  const { theme } = useTheme()
  const [waterMl, setWaterMl] = useState<number | null>(initialData?.water_ml ?? null)
  const [steps, setSteps] = useState(initialData?.steps != null ? String(initialData.steps) : '')
  const [sleepHours, setSleepHours] = useState<number | null>(initialData?.sleep_hours ?? null)
  const [fastingHours, setFastingHours] = useState<number | null>(initialData?.fasting_hours ?? null)
  const [supplements, setSupplements] = useState<string[]>(initialData?.supplements ?? [])
  // Espejo del isPending web (useTransition): deshabilita TODOS los controles
  // mientras se persiste, evitando upserts concurrentes (Ola0 P2 #11).
  const [saving, setSaving] = useState(false)

  // ── Salud del alumno via agregadores (E6.3) ────────────────────────────────────────────────────
  // Opt-in device-local (revocable): al conectar, autocompleta pasos/sueño desde HealthKit/Health
  // Connect SOLO cuando el campo está vacío (JAMÁS pisa lo que el alumno escribió). Se guarda por el
  // flujo manual existente. Todo el módulo degrada honesto: sin agregador nativo (Expo Go) no aparece.
  const healthAvailable = isHealthAvailable()
  const [healthOptIn, setHealthOptInState] = useState(false)
  const [connectingHealth, setConnectingHealth] = useState(false)
  const [fromPhone, setFromPhone] = useState<{ steps: boolean; sleep: boolean }>({ steps: false, sleep: false })
  const autofillDone = useRef(false)
  const stepsRef = useRef(steps)
  stepsRef.current = steps
  const sleepRef = useRef(sleepHours)
  sleepRef.current = sleepHours

  useEffect(() => {
    void getHealthOptIn().then(setHealthOptInState)
  }, [])

  // Autocompletado (una vez por montaje) cuando hay opt-in: pasos de hoy + sueño de anoche.
  useEffect(() => {
    if (!healthAvailable || !healthOptIn || !isToday || autofillDone.current) return
    autofillDone.current = true
    let alive = true
    void (async () => {
      const [phoneSteps, phoneSleep] = await Promise.all([readTodaySteps(), readLastNightSleepHours()])
      if (!alive) return
      if (phoneSteps != null && phoneSteps > 0 && stepsRef.current.trim() === '') {
        setSteps(String(phoneSteps))
        setFromPhone((p) => ({ ...p, steps: true }))
        void save({ steps: phoneSteps })
      }
      const chip = nearestSleepOption(phoneSleep, SLEEP_OPTIONS)
      if (chip != null && sleepRef.current == null) {
        setSleepHours(chip)
        setFromPhone((p) => ({ ...p, sleep: true }))
        void save({ sleep_hours: chip })
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthAvailable, healthOptIn, isToday])

  async function connectHealth() {
    setConnectingHealth(true)
    const granted = await requestHealthPermissions()
    setConnectingHealth(false)
    if (!granted) {
      toast.error('No se pudo conectar con Salud')
      return
    }
    await setHealthOptIn(true)
    autofillDone.current = false
    setHealthOptInState(true)
  }

  async function disconnectHealth() {
    await setHealthOptIn(false)
    setHealthOptInState(false)
    setFromPhone({ steps: false, sleep: false })
  }

  // Refetch/sync al montar y al cambiar cliente/fecha o cuando el shell recarga
  // `habitsToday` (pull-to-refresh) → re-sincroniza TODO el estado desde el servidor
  // (web HabitsCard.tsx:47-57).
  useEffect(() => {
    let alive = true
    getDailyHabits(clientId, logDate).then((d) => {
      if (!alive) return
      setWaterMl(d?.water_ml ?? null)
      setSteps(d?.steps != null ? String(d.steps) : '')
      setSleepHours(d?.sleep_hours ?? null)
      setFastingHours(d?.fasting_hours ?? null)
      setSupplements(d?.supplements ?? [])
    })
    return () => { alive = false }
  }, [clientId, logDate, initialData])

  async function save(patch: Partial<HabitsData>) {
    if (!isToday) return
    setSaving(true)
    const { error } = await upsertDailyHabits(clientId, logDate, patch)
    setSaving(false)
    if (error) toast.error(error.message || 'Error al guardar hábitos')
  }

  const disabled = !isToday || saving
  const handleWater = (ml: number) => { const next = waterMl === ml ? null : ml; setWaterMl(next); void save({ water_ml: next }) }
  const handleSleep = (h: number) => { const next = sleepHours === h ? null : h; setSleepHours(next); void save({ sleep_hours: next }) }
  const toggleFasting = () => { const next = fastingHours && fastingHours > 0 ? null : FASTING_DEFAULT_H; setFastingHours(next); void save({ fasting_hours: next }) }
  const toggleSupps = () => { const next = supplements.length > 0 ? [] : [SUPPLEMENTS_GENERIC]; setSupplements(next); void save({ supplements: next }) }
  const handleStepsBlur = () => { const v = parseInt(steps, 10); const next = isNaN(v) || v < 0 ? null : v; setSteps(next == null ? '' : String(next)); void save({ steps: next }) }

  const waterL = (waterMl ?? 0) / 1000
  const fastingOn = !!fastingHours && fastingHours > 0
  const suppsOn = supplements.length > 0
  const toggles = [
    { label: fastingOn ? `Ayuno ${fastingHours}h` : 'Ayuno', on: fastingOn, onPress: toggleFasting },
    { label: 'Suplementos', on: suppsOn, onPress: toggleSupps },
  ]

  return (
    <Card padding={16} style={{ gap: 16 }}>
      {/* Conectar salud (E6.3): opt-in una vez → autocompleta pasos/sueño; revocable. Solo si hay
          agregador nativo (HealthKit / Health Connect). Oculto en Expo Go / web. */}
      {healthAvailable && isToday ? (
        healthOptIn ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Smartphone size={14} color={theme.primary} strokeWidth={2} />
            <Text className="text-muted" style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 12 }}>
              Conectado a Salud · pasos y sueño se autocompletan
            </Text>
            <TouchableOpacity onPress={disconnectHealth} activeOpacity={0.7} accessibilityRole="button">
              <Text className="text-subtle" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>Desconectar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            testID="btn-connect-health"
            onPress={connectHealth}
            disabled={connectingHealth}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Conectar salud para autocompletar pasos y sueño"
            className="rounded-control border-subtle"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, opacity: connectingHealth ? 0.6 : 1 }}
          >
            <HeartPulse size={16} color={theme.primary} strokeWidth={2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>
                {connectingHealth ? 'Conectando…' : 'Conectar salud'}
              </Text>
              <Text className="text-subtle" style={{ fontFamily: FONT.uiSemibold, fontSize: 11, marginTop: 1 }}>
                Autocompleta pasos y sueño desde tu teléfono
              </Text>
            </View>
          </TouchableOpacity>
        )
      ) : null}

      {/* Agua */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Droplets size={15} className="text-aqua-700" strokeWidth={2} />
            <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>Agua</Text>
          </View>
          <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
            <Text className="text-aqua-700">{waterL.toFixed(waterL % 1 ? 1 : 0)}</Text> / 3 L
          </Text>
        </View>
        <View className="bg-surface-sunken" style={{ height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 10 }}>
          <MotiView
            className="bg-aqua-700"
            animate={{ width: `${Math.min(100, ((waterMl ?? 0) / WATER_TARGET) * 100)}%` }}
            transition={{ type: 'timing', duration: 220, easing: Easing.bezier(0.22, 1, 0.36, 1) }}
            style={{ height: 8, borderRadius: 999 }}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {WATER_OPTIONS.map((v) => {
            const on = (waterMl ?? 0) >= v
            return (
              <TouchableOpacity
                key={v}
                disabled={disabled}
                onPress={() => handleWater(v)}
                activeOpacity={0.75}
                className={on ? 'border-aqua-700 bg-aqua-100' : 'border-subtle'}
                style={{ borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 6 }}
              >
                <Text className={on ? 'text-aqua-700' : 'text-subtle'} style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>{v < 1000 ? v : `${v / 1000}L`}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>

      {/* Pasos */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Footprints size={15} className="text-sport-600" strokeWidth={2} />
          <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>Pasos</Text>
          {fromPhone.steps ? <PhoneBadge /> : null}
        </View>
        <TextInput
          testID="habits-steps-input"
          value={steps}
          onChangeText={(t) => setSteps(t.replace(/\D/g, ''))}
          onEndEditing={handleStepsBlur}
          onBlur={handleStepsBlur}
          keyboardType="number-pad"
          editable={!disabled}
          placeholder="Ej: 8000"
          placeholderTextColor={TEXT_SUBTLE[theme.scheme]}
          className="rounded-control bg-surface-sunken text-strong"
          style={{ height: 42, borderWidth: 1.5, borderColor: theme.border, paddingHorizontal: 12, fontFamily: FONT.monoBold, fontSize: 14, color: theme.foreground, opacity: disabled ? 0.5 : 1 }}
        />
      </View>

      {/* Sueño */}
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Moon size={14} color={theme.mutedForeground} strokeWidth={2} />
          <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 13 }}>Sueño <Text className="text-subtle" style={{ fontFamily: FONT.uiSemibold }}>· horas</Text></Text>
          {fromPhone.sleep ? <PhoneBadge /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SLEEP_OPTIONS.map((v) => {
            const on = sleepHours === v
            return (
              <TouchableOpacity
                key={v}
                disabled={disabled}
                onPress={() => handleSleep(v)}
                activeOpacity={0.75}
                className={on ? 'border-sport-500 bg-sport-100' : 'border-subtle'}
                style={{ flex: 1, minWidth: 0, height: 42, borderRadius: theme.radius.control, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text className={on ? 'text-sport-600' : 'text-subtle'} style={{ fontFamily: FONT.uiBold, fontSize: 12.5 }}>{v}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {/* Ayuno + Suplementos */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {toggles.map((t) => (
          <TouchableOpacity
            key={t.label}
            disabled={disabled}
            onPress={t.onPress}
            activeOpacity={0.75}
            className={t.on ? 'border-sport-500 bg-sport-100' : 'border-subtle'}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: theme.radius.control, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <View
              className={t.on ? 'bg-sport-500' : 'border-strong'}
              style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: t.on ? 0 : 2 }}
            >
              {t.on ? <Check size={13} color="#fff" strokeWidth={2} /> : null}
            </View>
            <Text className={t.on ? 'text-strong' : 'text-muted'} style={{ fontFamily: FONT.uiBold, fontSize: 12.5 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isToday ? <Text className="text-subtle" style={{ textAlign: 'center', fontSize: 10, fontFamily: FONT.ui }}>Solo se puede editar el día de hoy</Text> : null}
    </Card>
  )
}

/** Badge "de tu teléfono": marca un valor pre-llenado por el agregador de salud (editable). */
function PhoneBadge() {
  return (
    <View className="rounded-pill border-subtle bg-surface-sunken" style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1.5 }}>
      <Smartphone size={9} className="text-subtle" strokeWidth={2.2} />
      <Text className="text-subtle" style={{ fontFamily: FONT.uiBold, fontSize: 9 }}>de tu teléfono</Text>
    </View>
  )
}
