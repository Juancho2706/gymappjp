import { useEffect, useRef, useState } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { cssInterop } from 'nativewind'
import { ArrowRightLeft, Dumbbell, RotateCw, TriangleAlert } from 'lucide-react-native'
import { Sheet } from '../../Sheet'
import { FONT, textStyle } from '../../../lib/typography'
import { exerciseGridThumb } from '../../../lib/exercise-catalog'
import {
  equipmentLabel,
  fetchSubstituteCandidates,
  InvalidBlockIdError,
  type SubstituteCandidate,
} from '../../../lib/workout/substitution'

// Let NativeWind drive lucide icon color via `className` (text-*) so the dark
// accent tokens (sport-300, warning-500, on-dark…) own the color, no JS literals.
cssInterop(ArrowRightLeft, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Dumbbell, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(RotateCw, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(TriangleAlert, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * SubstituteExerciseSheet (E2-05) — bottom-sheet de sustitución de "máquina ocupada" del
 * ejecutor alumno RN. Puerto 1:1 del `SubstituteExerciseSheet` web (Fase L · workstream C, DC-3):
 * `apps/web/src/app/c/[coach_slug]/workout/[planId]/_components/SubstituteExerciseSheet.tsx`.
 *
 * Contrato idéntico al web (SPEC verificada línea a línea):
 *  - Props: `open`/`onOpenChange`/`blockId`/`prescribedName`/`muscleGroup`/`onConfirm(option)`.
 *  - NO persiste: un tap en la card llama `onConfirm(opt)` (swap SOLO de la sesión de hoy; el
 *    plan no se toca). El badge "Sustituido" + deshacer viven en el caller (ExecutorV2).
 *  - Motivo constante `machine_busy` (NG-4): es copy ("Máquina ocupada — …"), NO un picker.
 *  - Chrome SIEMPRE dark (Sheet `forceDark`): ink-950 / border-inverse / text-on-dark / sport-300,
 *    como el resto de la exec (web fuerza `bg-[var(--ink-950)]` en claro y oscuro, web L73).
 *  - Lazy: pide sugerencias al abrir para un `blockId` concreto (evento raro, sin prefetch).
 *  - 4 ramas de estado exclusivas: cargando (skeletons pulse) · error (reintentar) · vacío · lista.
 */

interface Props {
  /** Controla visibilidad (web `open`). */
  open: boolean
  /** Cierre por backdrop/swipe/botón X (web `onOpenChange`). */
  onOpenChange: (open: boolean) => void
  /** Bloque a sustituir (fuente del candidate set en el server). */
  blockId: string | null
  /** Ejercicio prescrito (header + aria). */
  prescribedName: string
  /** Grupo muscular (subtítulo + estado vacío). */
  muscleGroup: string
  /** Confirmar la elección → swap in-place SOLO de esta sesión (el plan NO se toca). */
  onConfirm: (option: SubstituteCandidate) => void
}

/** Selección emitida por el sheet / consumida por el núcleo al loguear. */
export interface SubstitutionSelection {
  exerciseId: string | null
  name: string
  reason: string | null
}

/**
 * Helper PURO (contrato de integración, fuera de la UI del sheet): mapea la selección a las
 * columnas de `workout_logs`. El núcleo lo hace merge dentro del payload del set al loguear.
 * `null`/undefined ⇒ log normal (sin sustitución). No toca `exercise_id` del log (el sustituto
 * vive SOLO en estas columnas — migración `20260704160352_workout_logs_substitution_columns.sql`).
 */
export function buildSubstitutionLogFields(sub: SubstitutionSelection | null | undefined): {
  substituted_exercise_id: string | null
  substituted_exercise_name: string | null
  substitution_reason: string | null
} {
  if (!sub) {
    return { substituted_exercise_id: null, substituted_exercise_name: null, substitution_reason: null }
  }
  return {
    substituted_exercise_id: sub.exerciseId ?? null,
    substituted_exercise_name: sub.name ?? null,
    substitution_reason: sub.reason ?? null,
  }
}

export function SubstituteExerciseSheet({ open, onOpenChange, blockId, prescribedName, muscleGroup, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<SubstituteCandidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (id: string) => {
    setError(null)
    setOptions(null)
    setLoading(true)
    fetchSubstituteCandidates(id)
      .then((set) => {
        // Paridad con el server action web: top-5 (rankSubstitutes limit 5, action L31).
        if (!set) setError('No se pudo resolver el ejercicio de este bloque.')
        else setOptions(set.candidates.slice(0, 5))
      })
      .catch((e) =>
        // GUID malformado → misma copia que el server action web ('Bloque inválido.'); el resto,
        // el mensaje genérico de red (rama RN-only, no existe en web).
        setError(e instanceof InvalidBlockIdError ? 'Bloque inválido.' : 'No pudimos cargar alternativas. Revisa tu conexión.'),
      )
      .finally(() => setLoading(false))
  }

  // Pide sugerencias CADA vez que se abre para un bloque concreto; limpia al cerrar (web L57-63).
  useEffect(() => {
    if (open && blockId) load(blockId)
    if (!open) {
      setOptions(null)
      setError(null)
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockId])

  const showLoading = loading || (open && options === null && error === null)

  return (
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      snapPoints={['85%']}
      // Contenido-hug hasta 85% (web `h-auto max-h-[85dvh]`): los estados corto (vacío/error/
      // cargando) hugean su contenido en vez de flotar dentro de un sheet fijo del 85%.
      dynamicSizing
      scrollable
      // Header FIJO: se queda anclado arriba mientras solo scrollea la lista — RN-idiomático del
      // split web `shrink-0` header (L76) + `overflow-y-auto` body (L89). El header sigue DENTRO del
      // contenido medido, así que dynamicSizing hugea bien. Es el hijo 0 (abajo).
      stickyHeaderIndices={[0]}
      forceDark
      // Nombre accesible del diálogo (web `aria-label`, SubstituteExerciseSheet.tsx:72).
      accessibilityLabel={`Cambiar ${prescribedName} por máquina ocupada`}
    >
      {/* Hijo 0 = header sticky. Fondo opaco (ink-950 = fondo del sheet) para tapar la lista al
          scrollear por debajo. Grabber = handle del Sheet. */}
      <View style={styles.headerBlock} className="bg-ink-950">
        <View style={styles.eyebrowRow}>
          {/* strokeWidth 2 = default lucide, igual que el ArrowRightLeft web (sin prop, L79). */}
          <ArrowRightLeft className="text-sport-300" size={14} strokeWidth={2} />
          {/* 11px (3xs) uiBold uppercase + tracking wide (~0.04em) — web `text-[11px] tracking-wider`. */}
          <Text style={styles.eyebrow} className="text-sport-300">
            Cambiar ejercicio
          </Text>
        </View>
        {/* Sin numberOfLines: nombres largos hacen wrap libre como en web (título sin line-clamp). */}
        <Text
          style={textStyle('xl', FONT.displayBlack, { lh: 'tight', ls: 'tight' })}
          className="text-on-dark mt-1"
        >
          {prescribedName}
        </Text>
        {/* 12px (2xs) peso regular (FONT.ui) — web `text-[12px]` sin font-weight ⇒ 400
            (SubstituteExerciseSheet.tsx:84). Separador ` · ` incondicional como el web (L85:
            `{muscleGroup} · Máquina…`, muscleGroup se muestra siempre, sin guard de vacío). */}
        <Text style={textStyle('2xs', FONT.ui)} className="text-on-dark-muted mt-1">
          {muscleGroup} · Máquina ocupada — el cambio vale{' '}
          <Text style={{ fontFamily: FONT.uiSemibold }} className="text-on-dark">
            solo por hoy
          </Text>{' '}
          y no toca tu plan.
        </Text>
      </View>

      {/* Rama exclusiva: cargando · error · vacío · lista. */}
      {showLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <View style={styles.centerState}>
          <TriangleAlert className="text-warning-500" size={32} strokeWidth={2} />
          <Text style={textStyle('sm', FONT.ui)} className="text-on-dark-muted text-center">
            {error}
          </Text>
          {blockId ? (
            <Pressable
              testID="substitute-retry"
              onPress={() => load(blockId)}
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
            >
              {({ pressed }) => (
                <View
                  className={`flex-row items-center justify-center rounded-control ${pressed ? 'bg-white/[0.12]' : 'bg-white/[0.06]'}`}
                  style={styles.retryBtn}
                >
                  <RotateCw className="text-on-dark" size={16} />
                  <Text style={{ ...textStyle('sm', FONT.uiBold), marginLeft: 8 }} className="text-on-dark">
                    Reintentar
                  </Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : options && options.length === 0 ? (
        <View style={styles.centerState}>
          <View className="items-center justify-center rounded-pill bg-white/[0.06]" style={styles.emptyIcon}>
            <Dumbbell className="text-on-dark-muted" size={28} />
          </View>
          <Text style={textStyle('sm', FONT.ui)} className="text-on-dark-muted text-center">
            No encontramos alternativas equivalentes para{' '}
            <Text style={{ fontFamily: FONT.uiSemibold }} className="text-on-dark">
              {muscleGroup}
            </Text>{' '}
            en tu catálogo.
          </Text>
        </View>
      ) : options && options.length > 0 ? (
        <View style={styles.list} accessibilityRole="list" accessibilityLabel={`Alternativas para ${prescribedName}`}>
          {options.map((opt) => (
            <CandidateRow key={opt.id} opt={opt} onPress={() => onConfirm(opt)} />
          ))}
        </View>
      ) : null}
    </Sheet>
  )
}

/** 4 filas placeholder con pulse de opacidad (web `animate-pulse`, L91-101). */
function LoadingSkeleton() {
  const opacity = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <View style={styles.list} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-center rounded-card border border-inverse bg-white/[0.03]" style={styles.row}>
          <Animated.View style={{ opacity, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View className="rounded-control bg-white/[0.06]" style={styles.thumb} />
            <View style={{ flex: 1, gap: 8 }}>
              <View className="bg-white/[0.06]" style={{ height: 14, width: '66%', borderRadius: 6 }} />
              <View className="bg-white/[0.05]" style={{ height: 12, width: '33%', borderRadius: 6 }} />
            </View>
          </Animated.View>
        </View>
      ))}
    </View>
  )
}

function CandidateRow({ opt, onPress }: { opt: SubstituteCandidate; onPress: () => void }) {
  // Miniatura LIGERA (WebP redimensionado vía render/image), no el gif crudo full-res — paridad
  // con el web `exerciseGridThumb(opt)` (SubstituteExerciseSheet.tsx:134 + nota de port #8).
  const thumb = exerciseGridThumb(opt)
  return (
    <Pressable
      testID={`substitute-option-${opt.id}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Usar ${opt.name} (${equipmentLabel(opt.equipment)})`}
    >
      {({ pressed }) => (
        <View
          className={`flex-row items-center rounded-card border ${pressed ? 'border-sport-500/50 bg-white/[0.06]' : 'border-inverse bg-white/[0.03]'}`}
          style={[styles.row, { transform: [{ scale: pressed ? 0.99 : 1 }] }]}
        >
          {/* Thumbnail 56x56 rounded-control */}
          <View className="items-center justify-center overflow-hidden rounded-control bg-white/[0.06]" style={styles.thumb}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="contain" cachePolicy="memory-disk" recyclingKey={opt.id} />
            ) : (
              <Dumbbell className="text-on-dark-muted" size={20} />
            )}
          </View>
          {/* Bloque texto */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={textStyle('sm', FONT.uiBold, { lh: 'snug' })} className="text-on-dark" numberOfLines={1}>
              {opt.name}
            </Text>
            <View style={styles.metaRow}>
              <View className="rounded-pill border border-sport-500/30 bg-sport-500/[0.10]" style={styles.badge}>
                <Text style={textStyle('3xs', FONT.uiBold)} className="text-sport-300">
                  {equipmentLabel(opt.equipment)}
                </Text>
              </View>
              {opt.muscle_group ? (
                <Text style={textStyle('3xs', FONT.ui)} className="text-on-dark-muted" numberOfLines={1}>
                  {opt.muscle_group}
                </Text>
              ) : null}
            </View>
          </View>
          {/* Pill "Usar" — reposo sport translúcido; al presionar la fila, sport sólido + texto blanco. */}
          <View className={`rounded-control ${pressed ? 'bg-sport-500' : 'bg-sport-500/[0.15]'}`} style={styles.usePill}>
            <Text style={textStyle('2xs', FONT.uiBold)} className={pressed ? 'text-white' : 'text-sport-300'}>
              Usar
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // Header sticky (hijo 0 del scroll): el px-20 lo da el contentContainer del Sheet; el gap:14 del
  // contentContainer aporta la separación inferior (≈ web pb-4). pt corto porque el handle ya deja aire.
  // Web `px-5 pt-3 pb-4` = 20 / 12 / 16 (SubstituteExerciseSheet.tsx:76).
  headerBlock: { gap: 2, paddingTop: 8, paddingBottom: 2 },
  // Eyebrow: 11px (3xs) uiBold uppercase + tracking wide (~0.04em) — web `text-[11px] tracking-wider`.
  eyebrow: { ...textStyle('3xs', FONT.uiBold, { ls: 'wide' }), textTransform: 'uppercase' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  list: { gap: 10 },
  row: { gap: 12, padding: 12 },
  thumb: { width: 56, height: 56 },
  thumbImg: { width: 56, height: 56, padding: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  usePill: { paddingHorizontal: 12, paddingVertical: 8 },
  centerState: { alignItems: 'center', gap: 12, paddingVertical: 40, paddingHorizontal: 8 },
  retryBtn: { paddingHorizontal: 16, minHeight: 44, marginTop: 4 },
  emptyIcon: { width: 56, height: 56 },
})
