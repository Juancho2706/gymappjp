import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CalendarCheck, Minus, Share2, TrendingDown, TrendingUp } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import type { WeeklyRecap, WeeklyRecapTone } from '../../lib/nutrition-recap'

/**
 * Recap semanal motivacional del alumno (feature K) — lado ALUMNO (mobile). Espejo de
 * apps/web/src/app/c/[coach_slug]/nutrition/_components/WeeklyRecapCard.tsx. Tono adaptativo
 * (gentil en semana floja, sin culpa). Comparte por Share nativo. Read-only.
 */

const TONE_COPY: Record<WeeklyRecapTone, { title: string; sub: string }> = {
  great: { title: '¡Semana sólida! 🔥', sub: 'Gran consistencia. Seguí con este ritmo.' },
  good: { title: 'Buen ritmo 💪', sub: 'Vas en camino — un poco más y la cierras redonda.' },
  gentle: { title: 'Semana tranquila', sub: 'Sin dramas. La próxima sumás unos días más y listo.' },
  start: { title: 'Arranca tu semana', sub: 'Registra tu primera comida para ver tu progreso aquí.' },
}

function shareText(recap: WeeklyRecap): string {
  const parts = [`Mi semana en nutrición: ${recap.thisWeekPct}% de adherencia`]
  parts.push(`${recap.daysLoggedThisWeek}/7 días registrados`)
  if (recap.deltaPct != null && recap.deltaPct > 0) parts.push(`+${recap.deltaPct}% vs la semana pasada 📈`)
  return `${parts.join(' · ')} 💪`
}

export function WeeklyRecapCard({ recap }: { recap: WeeklyRecap }) {
  const { theme } = useTheme()
  const copy = TONE_COPY[recap.tone]
  const isStart = recap.tone === 'start'

  const toneColor =
    recap.tone === 'great'
      ? theme.success
      : recap.tone === 'good'
        ? theme.primary
        : recap.tone === 'gentle'
          ? '#f59e0b'
          : theme.mutedForeground

  const DeltaIcon =
    recap.deltaPct == null || recap.deltaPct === 0 ? Minus : recap.deltaPct > 0 ? TrendingUp : TrendingDown
  const deltaColor =
    recap.deltaPct == null || recap.deltaPct === 0
      ? theme.mutedForeground
      : recap.deltaPct > 0
        ? theme.success
        : '#f59e0b'

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{copy.title}</Text>
          <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{copy.sub}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.secondary }]}>
          <Text style={[styles.badgeText, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Tu semana</Text>
        </View>
      </View>

      {!isStart && (
        <View style={styles.statsRow}>
          <View>
            <Text style={[styles.statLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
              ADHERENCIA · 7 DÍAS
            </Text>
            <View style={styles.pctRow}>
              <Text style={[styles.pct, { color: toneColor, fontFamily: 'Montserrat_800ExtraBold' }]}>{recap.thisWeekPct}%</Text>
              {recap.deltaPct != null && (
                <View style={styles.deltaRow}>
                  <DeltaIcon size={14} color={deltaColor} />
                  <Text style={[styles.deltaText, { color: deltaColor, fontFamily: 'Montserrat_700Bold' }]}>
                    {recap.deltaPct > 0 ? '+' : ''}
                    {recap.deltaPct}%
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.daysRow}>
            <CalendarCheck size={16} color={theme.mutedForeground} />
            <Text style={[styles.daysVal, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {recap.daysLoggedThisWeek}
            </Text>
            <Text style={[styles.daysLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>de 7 días</Text>
          </View>
        </View>
      )}

      {!isStart && (
        <TouchableOpacity
          onPress={() => Share.share({ message: shareText(recap) }).catch(() => {})}
          activeOpacity={0.8}
          style={[styles.shareBtn, { borderColor: theme.border, backgroundColor: theme.secondary }]}
        >
          <Share2 size={14} color={theme.foreground} />
          <Text style={[styles.shareText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Compartir mi semana</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, padding: 18, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' },
  statLabel: { fontSize: 9, letterSpacing: 0.8 },
  pctRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  pct: { fontSize: 34 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deltaText: { fontSize: 12 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  daysVal: { fontSize: 15 },
  daysLabel: { fontSize: 13 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  shareText: { fontSize: 12 },
})
