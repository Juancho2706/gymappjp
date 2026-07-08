import { Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
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
 */
export function MomentumCard({
  days,
  workoutCompliance,
  nutritionCompliance,
  checkInCompliance,
  nutritionEmpty,
  checkInEmpty,
  nutritionEnabled,
  workoutDays,
  nutritionDays,
  checkInCount,
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <ComplianceItem value={workoutCompliance} label="Entrenos" sub={`${workoutDays} días`} color={theme.primary} />
          {nutritionEnabled ? (
            <ComplianceItem value={nutritionCompliance} label="Nutrición" sub={`${nutritionDays} días`} color={EMBER_500} empty={nutritionEmpty} />
          ) : null}
          <ComplianceItem value={checkInCompliance} label="Check-ins" sub={`${checkInCount} de 4`} color={theme.success} empty={checkInEmpty} />
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
          <View key={i} className={`rounded-control ${cls}`} style={{ flex: 1, height: 54, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 }}>
            <Text className={d.isToday ? 'text-on-sport' : 'text-subtle'} style={{ fontFamily: FONT.displayBold, fontSize: 12 }}>{d.label}</Text>
            <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
              {d.isCompleted ? (
                <Check size={14} color={d.isToday ? '#fff' : theme.success} strokeWidth={3} />
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

function ComplianceItem({ value, label, sub, color, empty = false }: { value: number; label: string; sub: string; color: string; empty?: boolean }) {
  const { theme } = useTheme()
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <ProgressRing
        value={empty ? 0 : pct}
        size={74}
        stroke={7}
        color={empty ? theme.mutedForeground : color}
        showValue={false}
        label={
          <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 19, fontVariant: ['tabular-nums'] }}>
            {empty ? '—' : pct}
          </Text>
        }
      />
      <View style={{ alignItems: 'center' }}>
        <Text className="text-strong font-sans-bold" style={{ fontSize: 12 }}>{label}</Text>
        <Text className="text-subtle font-sans" style={{ fontSize: 10.5 }}>{empty ? 'Sin datos' : sub}</Text>
      </View>
    </View>
  )
}
