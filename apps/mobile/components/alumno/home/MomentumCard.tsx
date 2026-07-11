import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import {
  runOnJS,
  useAnimatedReaction,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { Card } from '../../Card'
import { ProgressRing } from '../../ProgressRing'
import { SectionTitle } from './SectionTitle'
import { EMBER_500 } from './types'

export interface MomentumDay {
  label: string
  isToday: boolean
  hasWorkout: boolean
  isCompleted: boolean
}

/**
 * §7 MomentumCard (web `momentum/MomentumCard.tsx` + `MomentumWeekStrip.tsx`):
 * FUSION de la tira semanal (L..D, hoy relleno, hecho = check, planificado = dot)
 * + los 3 anillos de cumplimiento (Entrenos sport / Nutrición ember / Check-ins
 * success). Nutrición se oculta si el dominio esta OFF → grid 2-col.
 *
 * `workoutDays`/`nutritionDays`/`checkInCount` llegan desde home.tsx pero NO se
 * renderizan: el web tampoco muestra sublineas de conteo (MomentumCard.tsx:26-28).
 * Se conservan en la firma porque el shell los pasa; limpiarlos exige tocar home.tsx.
 */
export function MomentumCard({
  days,
  workoutCompliance,
  nutritionCompliance,
  checkInCompliance,
  nutritionEmpty,
  nutritionEnabled,
}: {
  days: MomentumDay[]
  workoutCompliance: number
  nutritionCompliance: number
  checkInCompliance: number
  nutritionEmpty: boolean
  checkInEmpty: boolean
  nutritionEnabled: boolean
  workoutDays: number
  nutritionDays: number
  checkInCount: number
}) {
  const { theme } = useTheme()
  return (
    <View>
      <SectionTitle accent={theme.primary}>Momentum</SectionTitle>
      <Card padding="md">
        <WeekStrip days={days} />
        <View style={{ height: 1, marginVertical: 16, backgroundColor: theme.border }} />
        {/* Grilla anillos: columnas de ancho igual (web grid-cols-3|2 gap-2 items-start). */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {/* keys estables: si nutritionEnabled flipea en runtime, sin key React reconcilia por
              posicion y el anillo de Check-ins heredaria el estado de animacion del de Nutricion. */}
          <ComplianceItem key="entrenos" value={workoutCompliance} label="Entrenos" color={theme.primary} />
          {nutritionEnabled ? (
            <ComplianceItem key="nutricion" value={nutritionCompliance} label="Nutrición" color={EMBER_500} empty={nutritionEmpty} />
          ) : null}
          {/* Check-ins NUNCA recibe empty (web MomentumCard.tsx:98): 0 check-ins → 0% success, no gris. */}
          <ComplianceItem key="checkins" value={checkInCompliance} label="Check-ins" color={theme.success} />
        </View>
      </Card>
    </View>
  )
}

function WeekStrip({ days }: { days: MomentumDay[] }) {
  const { theme } = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {days.map((d, i) => {
        const planned = d.hasWorkout && !d.isCompleted && !d.isToday
        const cls = d.isToday
          ? 'bg-cta-fill'
          : d.isCompleted
            ? 'bg-surface-card border border-subtle'
            : 'bg-surface-sunken border border-subtle'
        return (
          <View key={i} className={`rounded-control ${cls}`} style={{ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text className={d.isToday ? 'text-on-sport' : 'text-subtle'} style={{ fontFamily: FONT.displayBold, fontSize: 12 }}>{d.label}</Text>
            <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
              {d.isCompleted ? (
                // Check siempre success, incluso hoy (web MomentumWeekStrip.tsx:37); strokeWidth default lucide (2).
                <Check size={14} color={theme.success} strokeWidth={2} />
              ) : d.isToday ? (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
              ) : planned ? (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary, opacity: 0.5 }} />
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** Count-up del numero (web framer spring stiffness 60/damping 20, ComplianceRing.tsx:31-45).
 * En reduce-motion o vacio muestra el valor final sin animar. */
function useCountUp(target: number, instant: boolean): number {
  const reduced = useReducedMotion()
  const still = instant || reduced
  const sv = useSharedValue(still ? target : 0)
  const [display, setDisplay] = useState(still ? target : 0)
  useEffect(() => {
    if (still) {
      sv.value = target
      setDisplay(target)
      return
    }
    sv.value = withSpring(target, { stiffness: 60, damping: 20 })
  }, [target, still, sv])
  useAnimatedReaction(
    () => Math.round(sv.value),
    (v, prev) => {
      if (v !== prev) runOnJS(setDisplay)(v)
    },
    [],
  )
  return display
}

function ComplianceItem({ value, label, color, empty = false }: { value: number; label: string; color: string; empty?: boolean }) {
  const { theme } = useTheme()
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const display = useCountUp(pct, empty)
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <ProgressRing
        value={empty ? 0 : pct}
        size={76}
        stroke={7}
        color={empty ? theme.ink300 : color}
        showValue={false}
        label={
          empty ? (
            <Text className="text-subtle" style={{ fontFamily: FONT.displayBlack, fontSize: 18 }}>—</Text>
          ) : (
            <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 19, letterSpacing: -0.57, fontVariant: ['tabular-nums'] }}>
              {display}
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 11 }}>%</Text>
            </Text>
          )
        }
      />
      <View style={{ alignItems: 'center' }}>
        <Text className="text-strong font-sans-bold" style={{ fontSize: 12 }}>{label}</Text>
        {empty ? <Text className="text-subtle font-sans" style={{ fontSize: 10 }}>Sin datos</Text> : null}
      </View>
    </View>
  )
}
