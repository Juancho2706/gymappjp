import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { ArrowRight, Calendar, CheckCircle2, ChevronRight, Play, RotateCcw } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { Badge } from '../../Badge'
import { Card } from '../../Card'
import { ProgramPhaseBar } from './ProgramPhaseBar'
import { DAY_SHORT, EMBER_500, EMBER_700 } from './types'
import type { PendingDay, PlanDayView, Program } from './types'

/**
 * §8 ActiveProgramSection (web `program/ActiveProgramSection.tsx`): nombre del
 * programa + badge "Semana X de Y" + ProgramPhaseBar (E1-05) + cola de pendientes
 * (E1-19, delta Fase L: dias pasados sin registrar → CTA "Recuperar Día X") +
 * day-cards (today/done/pending/upcoming) + link "Ver entreno de hoy →".
 */
export function ActiveProgramSection({
  program,
  currentWeek,
  totalWeeks,
  planDays,
  pending,
  todayPlanId,
  onStart,
}: {
  program: Program
  currentWeek: number
  totalWeeks: number
  planDays: PlanDayView[]
  pending: PendingDay[]
  todayPlanId: string | null
  onStart: (planId: string) => void
}) {
  const { theme } = useTheme()
  const oldestPending = pending[0] ?? null

  return (
    <Card padding="md" style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
          <Calendar size={16} color={theme.primary} strokeWidth={2.25} />
          <Text className="text-strong" numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, fontFamily: FONT.displayBold, fontSize: 16 }}>{program.name}</Text>
        </View>
        <Badge tone="sport" variant="soft">Semana {currentWeek} de {totalWeeks}</Badge>
      </View>

      <ProgramPhaseBar phases={program.phases} currentWeek={currentWeek} totalWeeks={totalWeeks} />

      {oldestPending ? (
        <TouchableOpacity
          testID="program-pending-cta"
          onPress={() => onStart(oldestPending.planId)}
          activeOpacity={0.82}
          className="rounded-control"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: EMBER_500 + '38', backgroundColor: EMBER_500 + '1A', paddingHorizontal: 14, paddingVertical: 12 }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 }}>
            <RotateCcw size={18} color="#fff" strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: EMBER_700 }}>
              {pending.length === 1 ? 'Tenés 1 día pendiente' : `Tenés ${pending.length} días pendientes`} esta semana
            </Text>
            <Text numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 11.5, color: EMBER_700, marginTop: 2, opacity: 0.85 }}>
              Recuperar Día {oldestPending.dayOfWeek} · {oldestPending.dayLabel}
            </Text>
          </View>
          <ArrowRight size={16} color={EMBER_700} />
        </TouchableOpacity>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 2 }}>
        {planDays.map((d) => (
          <DayCard key={d.plan.id} view={d} onPress={() => onStart(d.plan.id)} />
        ))}
      </ScrollView>

      {todayPlanId ? (
        <TouchableOpacity onPress={() => onStart(todayPlanId)} activeOpacity={0.7}>
          <Text className="text-sport-600" style={{ textAlign: 'center', fontFamily: FONT.uiBold, fontSize: 11 }}>Ver entreno de hoy →</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  )
}

function DayCard({ view, onPress }: { view: PlanDayView; onPress: () => void }) {
  const { theme } = useTheme()
  const { plan, status, isToday } = view
  const dow = plan.day_of_week ?? 1
  const done = status === 'done'
  const pending = status === 'pending'

  const border = isToday ? theme.primary : pending ? EMBER_500 + '55' : theme.border
  const bg = isToday ? theme.primary + '1A' : pending ? EMBER_500 + '14' : theme.card
  const dayColor = isToday ? theme.primary : pending ? EMBER_700 : theme.mutedForeground

  return (
    <TouchableOpacity
      testID={`program-day-${plan.id}`}
      onPress={onPress}
      activeOpacity={0.8}
      className="rounded-control"
      style={{ width: 96, padding: 12, borderWidth: 1, borderColor: border, backgroundColor: bg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, color: dayColor }}>
          {DAY_SHORT[dow]}
        </Text>
        {done ? (
          <CheckCircle2 size={14} color={theme.success} strokeWidth={2.4} />
        ) : isToday ? (
          <Play size={12} color={theme.primary} strokeWidth={2.6} />
        ) : pending ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: EMBER_500 }} />
        ) : (
          <ChevronRight size={13} color={theme.mutedForeground} />
        )}
      </View>
      <Text className="text-strong" numberOfLines={2} style={{ marginTop: 6, fontFamily: FONT.uiBold, fontSize: 13, lineHeight: 16 }}>{plan.title}</Text>
      <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 10.5, fontFamily: pending ? FONT.uiBold : FONT.ui, color: pending ? EMBER_700 : theme.mutedForeground }}>
        {pending ? 'Pendiente' : `Día ${dow}`}
      </Text>
    </TouchableOpacity>
  )
}
