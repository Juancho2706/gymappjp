import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { ArrowDown, ArrowUp, Minus, Scale } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { formatRelativeDate, getTodayInSantiago } from '../../../lib/date-utils'
import { AnimatedNumber } from '../../AnimatedNumber'
import { Card } from '../../Card'
import { Sparkline } from '../../Sparkline'
import { WeightQuickLog } from './WeightQuickLog'
import type { CheckInPoint } from './types'
import { DANGER_600, SUCCESS_500 } from './types'

type Trend = 'up' | 'down' | 'stable'

function computeTrend(pts: { weight: number }[]): { trend: Trend; delta: number } {
  if (pts.length < 2) return { trend: 'stable', delta: 0 }
  const last7 = pts.slice(-7)
  const prev7 = pts.slice(-14, -7)
  if (last7.length === 0 || prev7.length === 0) return { trend: 'stable', delta: 0 }
  const avgLast = last7.reduce((s, p) => s + p.weight, 0) / last7.length
  const avgPrev = prev7.reduce((s, p) => s + p.weight, 0) / prev7.length
  const delta = avgLast - avgPrev
  if (delta > 0.3) return { trend: 'up', delta }
  if (delta < -0.3) return { trend: 'down', delta: Math.abs(delta) }
  return { trend: 'stable', delta: 0 }
}

/**
 * §9 WeightWidget (web `weight/WeightWidget.tsx`): sin peso → empty (Scale + CTA
 * check-in) + WeightQuickLog. Con datos → "Peso actual" + headline con count-up +
 * TrendArrow (7d vs 7d previos) + fecha relativa + sparkline 14d + WeightQuickLog.
 */
export function WeightWidget({
  clientId,
  checkIns,
  onSaved,
  onCheckIn,
}: {
  clientId: string
  checkIns: CheckInPoint[]
  onSaved: () => void
  onCheckIn: () => void
}) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const withW = checkIns.filter((c) => c.weight != null).map((c) => ({ date: c.date.slice(0, 10), weight: c.weight as number }))
  const { iso: todayIso } = getTodayInSantiago()

  if (withW.length === 0) {
    return (
      <Card padding="lg" style={{ alignItems: 'center' }}>
        <Scale size={40} color={theme.mutedForeground} strokeWidth={1.75} />
        <Text className="text-strong font-sans-bold" style={{ fontSize: 14, marginTop: 8 }}>Aún sin registros de peso</Text>
        <TouchableOpacity onPress={onCheckIn} activeOpacity={0.7} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text className="text-sport-600" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>Check-in completo →</Text>
        </TouchableOpacity>
        <View style={{ width: '100%' }}>
          <WeightQuickLog clientId={clientId} onSaved={onSaved} />
        </View>
      </Card>
    )
  }

  const last = withW[withW.length - 1]
  const { trend, delta } = computeTrend(withW)
  const spark = withW.slice(-14).map((p) => p.weight)

  return (
    <Card padding="md">
      <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Peso actual</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <AnimatedNumber
            value={last.weight}
            format={(n) => n.toFixed(1)}
            style={{ fontFamily: FONT.displayBlack, fontSize: 28, lineHeight: 30, letterSpacing: -1, fontVariant: ['tabular-nums'], color: theme.foreground }}
          />
          <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 13, marginLeft: 4 }}>kg</Text>
        </View>
        <TrendArrow trend={trend} deltaKg={delta} />
      </View>
      <Text className="text-muted font-sans" style={{ fontSize: 12, marginTop: 4 }}>{formatRelativeDate(last.date, todayIso)}</Text>
      <View style={{ marginTop: 12 }}>
        <Sparkline values={spark} width={Math.max(0, width - 64)} height={56} color={theme.primary} />
      </View>
      <WeightQuickLog clientId={clientId} onSaved={onSaved} />
    </Card>
  )
}

function TrendArrow({ trend, deltaKg }: { trend: Trend; deltaKg: number }) {
  const { theme } = useTheme()
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
  const color = trend === 'up' ? DANGER_600 : trend === 'down' ? SUCCESS_500 : theme.mutedForeground
  const bg = trend === 'stable' ? 'transparent' : color + '1F'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: bg }}>
      <Icon size={14} color={color} strokeWidth={2.5} />
      {trend !== 'stable' ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color, fontVariant: ['tabular-nums'] }}>
          {trend === 'up' ? '+' : ''}{deltaKg.toFixed(1)} kg
        </Text>
      ) : null}
    </View>
  )
}
