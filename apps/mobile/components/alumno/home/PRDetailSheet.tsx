import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { ArrowUpRight, TrendingUp } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getSantiagoIsoYmdForUtcInstant } from '../../../lib/date-utils'
import { getExercisePRHistory, type ExercisePRDetail } from '../../../lib/history.queries'
import { Sheet } from '../../Sheet'
import { Skeleton } from '../../Skeleton'
import { Sparkline } from '../../Sparkline'

/** "12 de junio de 2026" — fecha larga es-CL, dia calendario Santiago. */
function fmtLong(iso: string): string {
  const ymd = getSantiagoIsoYmdForUtcInstant(iso)
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}
function fmtShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * E1-04 PRDetailSheet (web `records/PRDetailSheet.tsx`): progresion del lift
 * on-demand en un Sheet DS. PR actual (numero grande sport + 1RM) + sparkline de
 * progresion + hitos ("cada vez que subiste la marca") + CTA "Ver técnica".
 */
export function PRDetailSheet({
  open,
  onClose,
  clientId,
  exerciseId,
  exerciseName,
  fallbackWeight,
  onTecnica,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  exerciseId: string | null
  exerciseName: string
  fallbackWeight: number | null
  onTecnica: (name: string) => void
}) {
  const { theme } = useTheme()
  const { width } = useWindowDimensions()
  const [detail, setDetail] = useState<ExercisePRDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !exerciseId) return
    setDetail(null)
    setLoading(true)
    getExercisePRHistory(clientId, exerciseId)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [open, exerciseId, clientId])

  const currentWeight = detail?.currentPr.weightKg ?? fallbackWeight
  const currentAt = detail?.currentPr.achievedAt ?? null
  const latest1RM = detail?.history.length ? detail.history[detail.history.length - 1].estimated1RM : null
  const spark = (detail?.history ?? []).map((p) => p.topWeightKg)
  const milestones = [...(detail?.milestones ?? [])].reverse()

  return (
    <Sheet open={open} onClose={onClose} title={exerciseName} snapPoints={['55%', '88%']}>
      {/* PR actual */}
      <View className="rounded-card bg-surface-sunken border border-subtle" style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Record actual</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <Text className="text-sport-500" style={{ fontFamily: FONT.displayBlack, fontSize: 34, lineHeight: 34, fontVariant: ['tabular-nums'] }}>{currentWeight ?? '—'}</Text>
          <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}>kg</Text>
        </View>
        {currentAt ? <Text className="text-muted font-sans" style={{ fontSize: 12, marginTop: 6 }}>Logrado el {fmtLong(currentAt)}</Text> : null}
        {latest1RM != null && latest1RM > 0 ? (
          <Text className="text-muted font-sans" style={{ fontSize: 11, marginTop: 2 }}>1RM estimado: {latest1RM} kg</Text>
        ) : null}
      </View>

      {/* Progresion */}
      {spark.length >= 2 ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <TrendingUp size={12} color={theme.mutedForeground} strokeWidth={2.5} />
            <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Progresión</Text>
          </View>
          <Sparkline values={spark} width={Math.max(0, width - 80)} height={64} color={theme.primary} />
        </View>
      ) : null}

      {/* Hitos */}
      {loading && milestones.length === 0 ? (
        <View style={{ gap: 8 }}>
          <Skeleton style={{ height: 40, borderRadius: 10 }} />
          <Skeleton style={{ height: 40, borderRadius: 10 }} />
        </View>
      ) : milestones.length > 0 ? (
        <View>
          <Text className="text-muted" style={{ fontFamily: FONT.uiBold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Cada vez que subiste la marca</Text>
          <View style={{ gap: 6 }}>
            {milestones.map((m) => (
              <View key={`${m.date}-${m.weightKg}`} className="rounded-control bg-surface-sunken border border-subtle" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
                  {m.prevKg > 0 ? `${m.prevKg} → ${m.weightKg} kg  +${m.deltaKg}` : `${m.weightKg} kg · primer registro`}
                </Text>
                <Text className="text-muted" style={{ fontSize: 12 }}>{fmtShort(m.date)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* CTA tecnica */}
      <TouchableOpacity
        testID="pr-detail-tecnica"
        onPress={() => onTecnica(exerciseName)}
        activeOpacity={0.8}
        className="rounded-control bg-surface-sunken border border-subtle"
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16 }}
      >
        <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}>Ver técnica</Text>
        <ArrowUpRight size={16} color={theme.foreground} strokeWidth={2.2} />
      </TouchableOpacity>
    </Sheet>
  )
}
