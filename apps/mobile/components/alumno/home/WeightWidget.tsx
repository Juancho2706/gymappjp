import { useEffect } from 'react'
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { cssInterop } from 'nativewind'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { ArrowDown, ArrowUp, Minus, Scale } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { formatRelativeDate, getTodayInSantiago } from '../../../lib/date-utils'
import { AnimatedNumber } from '../../AnimatedNumber'
import { Card } from '../../Card'
import { Sparkline } from '../../Sparkline'
import { WeightQuickLog } from './WeightQuickLog'
import type { CheckInPoint } from './types'

// className→color en los iconos de tendencia: deja que los tokens dark-aware
// (text-danger-700 / text-success-700 / text-muted) coloreen el trazo (P1 ola0).
cssInterop(ArrowUp, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(ArrowDown, { className: { target: 'style', nativeStyleToProp: { color: true } } })
cssInterop(Minus, { className: { target: 'style', nativeStyleToProp: { color: true } } })

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
    // Vacio: web hereda gap-4 (16px) de la Card base y no lo anula (web `:35`).
    return (
      <Card padding="lg" style={{ alignItems: 'center', gap: 16 }}>
        <Scale size={40} color={theme.mutedForeground} />
        <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>Aún sin registros de peso</Text>
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
        {/* Web WeightSparkline.tsx:48-57 — `mt-3 h-[72px]`, curva monotone strokeWidth 2,
            gradiente 0.25→0 y dot final r=4 con ring surface-card 2.5 (:35-44). */}
        <Sparkline values={spark} width={Math.max(0, width - 64)} height={72} color={theme.primary} strokeWidth={2} gradientOpacity={0.25} curve="monotone" endDot />
      </View>
      <WeightQuickLog clientId={clientId} onSaved={onSaved} />
    </Card>
  )
}

function TrendArrow({ trend, deltaKg }: { trend: Trend; deltaKg: number }) {
  const reduced = useReducedMotion()
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus
  // Semantica web: subir peso = ROJO (danger), bajar = VERDE (success). Tokens
  // dark-aware via className (P1 ola0 — antes DANGER_600/SUCCESS_500 fijos).
  const colorClass = trend === 'up' ? 'text-danger-700' : trend === 'down' ? 'text-success-700' : 'text-muted'
  const bgClass = trend === 'up' ? 'bg-danger-100' : trend === 'down' ? 'bg-success-100' : ''

  // Rebote infinito gateado por reduce-motion (web TrendArrow `:27-32`): up sube 4px,
  // down baja 4px, ciclo 1.5s con delay 0.5s.
  const ty = useSharedValue(0)
  useEffect(() => {
    if (reduced || trend === 'stable') {
      ty.value = 0
      return
    }
    const peak = trend === 'up' ? -4 : 4
    ty.value = withDelay(500, withRepeat(withSequence(withTiming(peak, { duration: 750 }), withTiming(0, { duration: 750 })), -1, false))
    return () => cancelAnimation(ty)
  }, [trend, reduced, ty])
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))

  return (
    <View className={bgClass} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Animated.View style={iconStyle}>
        <Icon className={colorClass} size={14} strokeWidth={2} />
      </Animated.View>
      {trend !== 'stable' ? (
        // Verbatim web TrendArrow.tsx:35 `{deltaKg > 0 ? '+' : ''}`: deltaKg llega en
        // positivo tambien en down (Math.abs, WeightWidget.tsx:23) → web muestra "+1.2 kg"
        // con flecha abajo. Paridad 2R-5: se replica tal cual (antes RN omitía el '+').
        <Text className={colorClass} style={{ fontFamily: FONT.uiBold, fontSize: 13, fontVariant: ['tabular-nums'] }}>
          {deltaKg > 0 ? '+' : ''}{deltaKg.toFixed(1)} kg
        </Text>
      ) : null}
    </View>
  )
}
