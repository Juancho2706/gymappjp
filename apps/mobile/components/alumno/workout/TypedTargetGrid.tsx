import { Pressable, Text, View } from 'react-native'
import { Timer } from 'lucide-react-native'
import {
  compactDistance,
  compactDuration,
  isTimeableInterval,
  SIDE_LABEL,
  type ExerciseType,
  type IntervalConfig,
} from '@eva/workout-engine'
import { formatPace, type HrZoneRange } from '@eva/cardio'
import { FONT, TYPE } from '../../../lib/typography'
import type { SessionBlock } from '../../../lib/workout-session'
import { useWorkoutTimers } from './timers/TimerProvider'

/**
 * Ejecución polimórfica del alumno (E2-10 + E2-11) — grilla de objetivos + botón de timer para los
 * bloques TIPADOS (cardio/movilidad/roller). Piel RN 1:1 del `TypedTargetGrid` / `TypedBlockTimerButton`
 * de web (`WorkoutExecutionClient`): las mismas cards (duración/distancia/pace/zona/lados/carga/descanso)
 * y el mismo ruteo de timer (intervalos / cronómetro / hold). Los bloques strength NO pasan por acá.
 *
 * Zona FC (E2-11): si el bloque cardio tiene `hr_zone` Y llega `hrZones` (rangos personalizados del
 * alumno, resueltos con @eva/cardio SOLO cuando `hasModule('cardio')` — ver `useClientCardioZones`),
 * el chip muestra el rango de pulsaciones objetivo "Z{n} · X–Y bpm". Sin módulo `hrZones` es null y
 * cae a solo "Z{n}", idéntico a web. `formatPace` sale de @eva/cardio (dominio compartido, sin drift).
 */

const ON_DARK = '#F4F6F8'

interface TargetCard {
  label: string
  value: string
  highlight?: boolean
}

/** Grilla de cards de objetivo por tipo (cardio/movilidad/roller). Mismo orden que web. */
export function TypedTargetGrid({
  block,
  kind,
  hrZones,
}: {
  block: SessionBlock
  kind: ExerciseType
  /** Rangos bpm por zona del alumno (E2-11); null si el módulo cardio está OFF o falta el perfil. */
  hrZones?: HrZoneRange[] | null
}) {
  const cards: TargetCard[] = []
  const interval = (block.interval_config ?? null) as IntervalConfig | null

  if (kind === 'cardio') {
    if (interval) {
      const work =
        interval.work.distance_m != null
          ? compactDistance(interval.work.distance_m, 'm')
          : interval.work.duration_sec != null
            ? compactDuration(interval.work.duration_sec)
            : '—'
      const rec = interval.recovery?.duration_sec
      cards.push({ label: 'Intervalos', value: `${interval.repeats}× ${work}${rec ? ` / r${rec}s` : ''}` })
    }
    if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Duración', value: compactDuration(block.duration_sec as number) })
    if ((block.distance_value ?? 0) > 0) cards.push({ label: 'Distancia', value: compactDistance(block.distance_value as number, block.distance_unit) })
    if (block.target_pace_sec_per_km != null) cards.push({ label: 'Pace objetivo', value: `${formatPace(block.target_pace_sec_per_km)} /km` })
    if (block.hr_zone != null) {
      const range = hrZones?.find((z) => z.zone === block.hr_zone) ?? null
      cards.push({
        label: 'Zona FC',
        value: range ? `Z${block.hr_zone} · ${range.minBpm}–${range.maxBpm} bpm` : `Z${block.hr_zone}`,
        highlight: true,
      })
    }
    if (block.sets > 1) cards.push({ label: 'Rondas', value: `${block.sets}` })
  }

  if (kind === 'mobility') {
    if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Hold', value: `${block.duration_sec}s` })
    cards.push({ label: 'Series', value: `${block.sets}` })
    if (block.reps_unit === 'breaths' && (block.reps_value ?? 0) > 0) cards.push({ label: 'Respiraciones', value: `${block.reps_value}` })
  }

  if (kind === 'roller') {
    if (block.reps_unit === 'passes' && (block.reps_value ?? 0) > 0) cards.push({ label: 'Pasadas', value: `${block.reps_value}` })
    else if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Duración', value: `${block.duration_sec}s` })
  }

  if (block.side_mode && SIDE_LABEL[block.side_mode]) cards.push({ label: 'Lado', value: SIDE_LABEL[block.side_mode] })
  if (block.load_value != null && block.load_value > 0) cards.push({ label: 'Carga', value: `${block.load_value} ${block.load_unit ?? 'kg'}` })
  if (block.rest_time) cards.push({ label: 'Descanso', value: block.rest_time })

  if (!cards.length) cards.push({ label: 'Objetivo', value: block.reps || '—' })

  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {cards.map((card) => (
        <View
          key={card.label}
          className={`rounded-sm border px-2.5 py-2 ${
            card.highlight ? 'border-ember-500/30 bg-ember-500/[0.14]' : 'border-inverse/10 bg-white/[0.05]'
          }`}
          style={{ flexBasis: '47%', flexGrow: 1 }}
        >
          <Text
            style={{ fontFamily: FONT.uiBold, fontSize: 9.5, letterSpacing: 0.57, textTransform: 'uppercase' }}
            className={card.highlight ? 'text-ember-300' : 'text-on-dark-muted'}
            numberOfLines={1}
          >
            {card.label}
          </Text>
          <Text style={TYPE.mono} className={`mt-0.5 text-[15px] font-mono-bold ${card.highlight ? 'text-ember-200' : 'text-on-dark'}`} numberOfLines={1}>
            {card.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Botón de timer según el tipo del bloque: intervalos / cronómetro / hold. Espeja web (AC5). */
export function TypedBlockTimerButton({ block, kind }: { block: SessionBlock; kind: ExerciseType }) {
  const timers = useWorkoutTimers()
  const interval = (block.interval_config ?? null) as IntervalConfig | null

  if (kind === 'cardio') {
    if (interval && isTimeableInterval(interval)) {
      return (
        <TimerButton testID="btn-timer-interval" label="Iniciar intervalos" onPress={() => timers.startInterval(interval, block.sets || 1)} />
      )
    }
    return <TimerButton testID="btn-timer-stopwatch" label="Cronómetro" onPress={() => timers.startStopwatch()} />
  }

  if ((kind === 'mobility' || kind === 'roller') && (block.duration_sec ?? 0) > 0) {
    const seconds = block.duration_sec as number
    const label = kind === 'mobility' ? `Timer de hold (${seconds}s)` : `Timer (${seconds}s)`
    return (
      <TimerButton
        testID="btn-timer-hold"
        label={label}
        onPress={() => timers.startHold(seconds, { label: kind === 'mobility' ? 'Hold' : 'Roller' })}
      />
    )
  }

  return null
}

function TimerButton({ testID, label, onPress }: { testID: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      className="h-11 flex-row items-center gap-1.5 self-end rounded-control border border-inverse/10 bg-sport-500/[0.12] px-3 active:opacity-90"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Timer size={15} color={ON_DARK} />
      <Text style={TYPE.caption} className="text-[12px] text-on-dark font-sans-bold">{label}</Text>
    </Pressable>
  )
}
