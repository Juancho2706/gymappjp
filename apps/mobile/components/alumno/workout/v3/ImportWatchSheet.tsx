import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, Pressable, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Sentry from '@sentry/react-native'
import { Check, HeartPulse, Ruler, Timer, Watch } from 'lucide-react-native'
import {
  hubZoneSec,
  matchHubWorkoutToWindow,
  type HrToZoneProfile,
  type HrZone,
  type HubWorkout,
} from '@eva/cardio'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import { isHealthAvailable, readHubWorkouts, requestHealthPermissions } from '../../../../lib/health-aggregators'
import { JuicyButton } from './JuicyButton'
import { formatClock } from './typed-screen-model'
import type { ExecTheme } from './exec-theme'

/**
 * "Importar de tu reloj" (specs/cardio-conectado · F2) — hoja del RESUMEN de la sesión que ofrece traer
 * el entrenamiento que el reloj (Apple Watch / Galaxy / Mi Band…) ya dejó en Apple Health o Health
 * Connect. Espejo estructural de `ConnectSensorSheet`: mismo chrome dark por `ExecTheme`, permisos
 * JUST-IN-TIME al abrir, estados honestos y un solo CTA.
 *
 * NO usa `<Sheet nativeModal>` a propósito: esta hoja se monta DENTRO del Modal de `SessionCompleteV3`
 * y un `<Modal>` de RN anidado en otro deja la pantalla gris al volver de una Activity nativa en Android
 * (QA-5, ver `ShareCardPreview.embedded`). Acá se renderiza como overlay absoluto en la MISMA ventana.
 *
 * Degradación honesta: sin agregador de salud el host ni ofrece la card; sin permisos, sin workout que
 * calce con la ventana de la sesión o con error del hub se muestra el estado real — jamás un dato
 * inventado ni un botón muerto. El parche del log lo aplica el host (`onApply`) por el pipeline
 * existente (`logSet`), y `hubImportPatch` garantiza que solo se rellenen ejes VACÍOS.
 */

const HEART = '#f87171' // == --z5 (mismo rojo del sensor en el ejecutor)
/** Colchón hacia atrás al consultar el hub: el reloj suele arrancar la actividad antes que la app. */
const LOOKBACK_MS = 10 * 60 * 1000

/** Serie del plan a la que se va a aplicar el import (la elige el host: bloque cardio con ejes vacíos). */
export interface WatchImportTarget {
  blockId: string
  setNumber: number
  /** Nombre del ejercicio (lo que ve el alumno). */
  name: string
  /** "Serie 2 de 3" cuando el bloque tiene más de una; null si es única. */
  detail: string | null
  /** Zona prescrita del bloque (`workout_blocks.hr_zone`), para el tiempo-en-zona de la vista previa. */
  hrZone: HrZone | null
}

type SheetPhase = 'loading' | 'unavailable' | 'denied' | 'empty' | 'preview' | 'error' | 'applying'

/** Hora local "H:MM" sin Intl (Hermes trae soporte parcial; acá no se arriesga formato). */
function clockLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Distancia es-CL: "2,5 km" (≥1000 m) o "800 m" — mismo criterio que el resumen de la sesión. */
function distanceLabel(meters: number): string {
  if (meters >= 1000) return `${(Math.round((meters / 1000) * 10) / 10).toString().replace('.', ',')} km`
  return `${Math.round(meters)} m`
}

/** Fuente legible del workout: la app/dispositivo del hub, si no la actividad, si no un rótulo neutro. */
function sourceLabel(workout: HubWorkout): string {
  const source = workout.source?.trim()
  if (source) return source
  const activity = workout.activity?.trim()
  if (activity) return activity
  return 'Tu reloj'
}

/** Rastro en Sentry SIN datos de salud: solo etapa y conteos (regla de observabilidad del SPEC). */
function reportImportFailure(stage: string, workoutCount: number | null): void {
  try {
    Sentry.captureMessage('cardio-conectado: import del reloj falló', {
      level: 'warning',
      tags: { area: 'cardio-conectado', platform: 'rn', stage },
      extra: workoutCount != null ? { workoutCount } : {},
    })
  } catch {
    // Sentry no inicializado (sin DSN) / versión sin API → no-op silencioso.
  }
}

export function ImportWatchSheet({
  open,
  onClose,
  exec,
  reducedMotion = false,
  sessionStartMs,
  sessionEndMs,
  targets,
  hrProfile = null,
  onApply,
}: {
  open: boolean
  onClose: () => void
  exec: ExecTheme
  reducedMotion?: boolean
  /** Ventana REAL de la sesión (epoch ms) — el matching exige ≥50% de solape con ella. */
  sessionStartMs: number
  sessionEndMs: number
  /** Series candidatas (bloques cardio con ejes vacíos). Con más de una, el alumno elige. */
  targets: WatchImportTarget[]
  /** Perfil FC del alumno: sin él la curva del reloj no se clasifica (y no se muestra tiempo en zona). */
  hrProfile?: HrToZoneProfile | null
  onApply: (workout: HubWorkout, target: WatchImportTarget) => Promise<void> | void
}) {
  const s = exec.surface
  const insets = useSafeAreaInsets()
  const [phase, setPhase] = useState<SheetPhase>('loading')
  const [workout, setWorkout] = useState<HubWorkout | null>(null)
  const [readCount, setReadCount] = useState(0)
  const [targetId, setTargetId] = useState<string | null>(null)
  // `targets` se recalcula en el host con cada cambio de logs: leerlo por ref evita que aplicar el
  // import re-dispare la consulta al hub (la lista cambia de identidad mientras la hoja sigue montada).
  const targetsRef = useRef(targets)
  targetsRef.current = targets

  const load = useCallback(async () => {
    setPhase('loading')
    setWorkout(null)
    // Sin agregador en esta build (Expo Go / plataforma sin soporte) el host ni ofrece la card; si
    // igual se llega acá, se dice la verdad en vez de fingir un permiso denegado.
    if (!isHealthAvailable()) {
      setPhase('unavailable')
      return
    }
    let workouts: HubWorkout[] = []
    try {
      // Permisos JUST-IN-TIME: recién acá (nunca al abrir la app ni al terminar la sesión). El
      // scope 'workouts' es lo que hace honesto el "concedido": en Android sólo cuenta como éxito
      // si quedó `ExerciseSession`, que es lo único que puede traer la sesión del reloj.
      const granted = await requestHealthPermissions('workouts')
      if (!granted) {
        setPhase('denied')
        return
      }
      workouts = await readHubWorkouts(sessionStartMs - LOOKBACK_MS, Date.now())
    } catch {
      reportImportFailure('read', null)
      setPhase('error')
      return
    }
    setReadCount(workouts.length)
    const match = matchHubWorkoutToWindow(workouts, sessionStartMs, sessionEndMs)
    if (!match) {
      setPhase('empty')
      return
    }
    setWorkout(match)
    setPhase('preview')
  }, [sessionStartMs, sessionEndMs])

  useEffect(() => {
    if (!open) return
    const list = targetsRef.current
    // Una sola serie candidata ⇒ preseleccionada (el alumno solo confirma); con varias, elige.
    setTargetId(list.length === 1 ? `${list[0].blockId}:${list[0].setNumber}` : null)
    void load()
  }, [open, load])

  // Back de Android: cierra ESTA hoja (no el resumen que está detrás) — no hay Modal que lo capture.
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose()
      return true
    })
    return () => sub.remove()
  }, [open, onClose])

  if (!open) return null

  const selected = targets.find((t) => `${t.blockId}:${t.setNumber}` === targetId) ?? null
  const canApply = phase === 'preview' && workout != null && selected != null

  // Tiempo en la zona pedida DENTRO de lo que trajo el reloj — solo con zona prescrita, perfil FC y
  // curva real (misma regla de dwell que el stream en vivo). Sin los tres no se muestra nada.
  const zoneLine = (() => {
    if (workout == null || selected?.hrZone == null || !hrProfile) return null
    const zoneSec = hubZoneSec(workout.hrSamples, hrProfile)
    if (zoneSec == null) return null
    const inZoneMin = Math.round(zoneSec[String(selected.hrZone) as keyof typeof zoneSec] / 60)
    const totalMin = Math.round(workout.durationSec / 60)
    if (totalMin <= 0) return null
    return `Tiempo en Z${selected.hrZone}: ${inZoneMin} de ${totalMin} min`
  })()

  const handleApply = async () => {
    if (!canApply || workout == null || selected == null) return
    void haptics.tap()
    setPhase('applying')
    try {
      await onApply(workout, selected)
    } catch {
      reportImportFailure('apply', null)
      setPhase('error')
    }
  }

  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, elevation: 60, justifyContent: 'flex-end' }}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Cerrar"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }}
      />
      <MotiView
        from={{ translateY: reducedMotion ? 0 : 320, opacity: reducedMotion ? 1 : 0 }}
        animate={{ translateY: 0, opacity: 1 }}
        transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
        style={{
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: 1.5,
          borderColor: s.borderStrong,
          backgroundColor: s.appBg,
          paddingHorizontal: 20,
          paddingTop: 14,
          // Safe area real del device (la hoja se dibuja pegada al borde inferior de la ventana).
          paddingBottom: insets.bottom + 16,
          gap: 14,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <View style={{ height: 4, width: 40, borderRadius: 999, backgroundColor: hexToRgba('#ffffff', 0.15) }} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Watch size={18} color={exec.accent} />
          <Text style={{ flex: 1, fontFamily: FONT.displayBlack, fontSize: 19, letterSpacing: -0.3, color: s.text }} numberOfLines={2}>
            Importar de tu reloj
          </Text>
        </View>

        {phase === 'loading' || phase === 'applying' ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 18 }}>
            <ActivityIndicator size="small" color={s.textMuted} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: s.textMuted, textAlign: 'center' }}>
              {phase === 'applying' ? 'Guardando lo del reloj…' : 'Buscando el entrenamiento de tu reloj…'}
            </Text>
          </View>
        ) : null}

        {phase === 'preview' && workout ? (
          <WorkoutPreview workout={workout} zoneLine={zoneLine} exec={exec} />
        ) : null}

        {phase === 'preview' && targets.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted }}>
              ¿A qué ejercicio?
            </Text>
            {targets.map((t) => {
              const id = `${t.blockId}:${t.setNumber}`
              const isSelected = id === targetId
              return (
                <TouchableOpacity
                  key={id}
                  testID={`btn-watch-import-target-${t.blockId}`}
                  activeOpacity={0.8}
                  onPress={() => setTargetId(id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${t.name}${t.detail ? `, ${t.detail}` : ''}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    borderWidth: 1.5,
                    backgroundColor: isSelected ? hexToRgba(exec.accent, 0.08) : s.surfaceRaised,
                    borderColor: isSelected ? hexToRgba(exec.accent, 0.55) : s.border,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.text }} numberOfLines={1}>{t.name}</Text>
                    {t.detail ? (
                      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted, marginTop: 2 }} numberOfLines={1}>
                        {t.detail}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? <Check size={16} color={exec.accent} strokeWidth={2.6} /> : null}
                </TouchableOpacity>
              )
            })}
          </View>
        ) : null}

        {phase === 'empty' ? (
          <EmptyState
            exec={exec}
            title="Tu reloj aún no sincronizó un entrenamiento de esta hora"
            body={
              readCount > 0
                ? 'Encontramos actividades, pero ninguna calza con el horario de esta sesión. Abre la app de tu reloj para que termine de sincronizar y reintenta.'
                : 'Abre la app de tu reloj para que sincronice con el centro de salud del teléfono y reintenta.'
            }
          />
        ) : null}

        {phase === 'denied' ? (
          <EmptyState
            exec={exec}
            title="Sin acceso a tus datos de salud"
            body="Para traer lo que registró tu reloj necesitamos permiso de LECTURA en el centro de salud del teléfono. Puedes darlo desde los ajustes del sistema y reintentar."
          />
        ) : null}

        {phase === 'error' ? (
          <EmptyState
            exec={exec}
            title="No pudimos leer el centro de salud"
            body="Algo falló al consultar tu centro de salud. Puedes reintentar o registrar los datos a mano."
          />
        ) : null}

        {phase === 'unavailable' ? (
          <EmptyState
            exec={exec}
            title="Esta versión no lee el centro de salud"
            body="El import necesita la app instalada desde la tienda (no funciona en Expo Go). Registra los datos a mano por ahora."
          />
        ) : null}

        {phase === 'preview' ? (
          <JuicyButton
            testID="btn-watch-import-apply"
            label="Usar estos datos"
            icon={<Check size={18} color={exec.accentText} strokeWidth={2.8} />}
            onPress={() => void handleApply()}
            exec={exec}
            height={56}
            reducedMotion={reducedMotion}
            disabled={!canApply}
            accessibilityLabel="Usar los datos del reloj en esta serie"
          />
        ) : phase === 'empty' || phase === 'error' || phase === 'denied' ? (
          <JuicyButton
            testID="btn-watch-import-retry"
            label="Reintentar"
            onPress={() => void load()}
            exec={exec}
            height={56}
            reducedMotion={reducedMotion}
            accessibilityLabel="Volver a buscar el entrenamiento del reloj"
          />
        ) : null}

        <TouchableOpacity
          testID="btn-watch-import-close"
          onPress={onClose}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sin importar"
          style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: s.textMuted }}>Ahora no</Text>
        </TouchableOpacity>

        {/* Nota HONESTA: qué se escribe y qué NO (el import jamás pisa lo tipeado). */}
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, lineHeight: 15.4, color: s.textDim, textAlign: 'center' }}>
          Solo completamos lo que dejaste en blanco. Nada de lo que escribiste se reemplaza.
        </Text>
      </MotiView>
    </View>
  )
}

/** Vista previa del workout del hub: fuente, horario y los ejes que trae (solo lo que existe). */
function WorkoutPreview({
  workout,
  zoneLine,
  exec,
}: {
  workout: HubWorkout
  /** "Tiempo en Z2: 18 de 30 min" cuando hay zona prescrita + perfil FC + curva; null si falta alguno. */
  zoneLine: string | null
  exec: ExecTheme
}) {
  const s = exec.surface
  const started = clockLabel(workout.startMs)
  const rows: { icon: React.ReactNode; label: string; value: string }[] = []
  if (workout.durationSec > 0) {
    rows.push({ icon: <Timer size={15} color={hexToRgba(exec.accent, 0.9)} />, label: 'Duración', value: formatClock(workout.durationSec) })
  }
  if (workout.distanceM != null && workout.distanceM > 0) {
    rows.push({ icon: <Ruler size={15} color={hexToRgba(exec.accent, 0.9)} />, label: 'Distancia', value: distanceLabel(workout.distanceM) })
  }
  if (workout.avgHr != null && workout.avgHr > 0) {
    rows.push({ icon: <HeartPulse size={15} color={HEART} />, label: 'FC promedio', value: `${Math.round(workout.avgHr)} bpm` })
  }
  if (workout.calories != null && workout.calories > 0) {
    rows.push({ icon: <Watch size={15} color={s.textMuted} />, label: 'Calorías', value: `${Math.round(workout.calories)} kcal` })
  }

  return (
    <View
      testID="watch-import-preview"
      style={{ gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: s.border, backgroundColor: s.surfaceSunken, paddingHorizontal: 14, paddingVertical: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(exec.accent, 0.14), borderWidth: 1.5, borderColor: hexToRgba(exec.accent, 0.35) }}>
          <Watch size={15} color={exec.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.text }} numberOfLines={1}>{sourceLabel(workout)}</Text>
          <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted, marginTop: 2 }} numberOfLines={1}>
            Comenzó a las {started}
          </Text>
        </View>
      </View>

      {rows.length > 0 ? (
        <View style={{ gap: 6 }}>
          {rows.map((r) => (
            <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ width: 18, alignItems: 'center' }}>{r.icon}</View>
              <Text style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>{r.label}</Text>
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 14, color: s.text, fontVariant: ['tabular-nums'] }}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>
          Tu reloj registró la sesión, pero sin métricas que podamos traer.
        </Text>
      )}

      {zoneLine ? (
        <Text testID="watch-import-zone-line" style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(s.text, 0.85) }}>
          {zoneLine}
        </Text>
      ) : null}
    </View>
  )
}

/** Estado vacío/erróneo honesto (sin CTA propio: el botón de reintento vive en el pie de la hoja). */
function EmptyState({ exec, title, body }: { exec: ExecTheme; title: string; body: string }) {
  const s = exec.surface
  return (
    <View style={{ gap: 6, borderRadius: 16, borderWidth: 1.5, borderColor: s.border, backgroundColor: s.surfaceSunken, paddingHorizontal: 14, paddingVertical: 14 }}>
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.text }}>{title}</Text>
      <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, lineHeight: 17, color: s.textMuted }}>{body}</Text>
    </View>
  )
}
