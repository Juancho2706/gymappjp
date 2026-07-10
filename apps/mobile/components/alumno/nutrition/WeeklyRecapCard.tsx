import { useEffect, useState } from 'react'
import { Share, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CalendarCheck, Minus, Share2, TrendingDown, TrendingUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
import { AnimatedNumber } from '../../AnimatedNumber'

/**
 * WeeklyRecapCard (E4-14) — recap semanal motivacional del alumno, espejo del web
 * `nutrition/_components/WeeklyRecapCard`. Cifra AUDITABLE (mismo motor
 * `computeNutritionAdherence`: ventana últimos 7d vs los 7 previos) servida por
 * `/api/mobile/nutrition/recap` — read-only, sin escribir datos. Tono ADAPTATIVO
 * (gentil en semana floja, SIN culpa ni presión). Comparte a apps nativas vía
 * `Share`. Números y copy IDÉNTICOS a la web.
 *
 * Self-contained: hace su propio fetch. `recap: null` (sin plan activo) → no
 * renderiza nada, igual que la web omite la sección. Acepta `refreshSignal` para
 * re-fetch al pull-to-refresh del shell.
 */

export type WeeklyRecapTone = 'great' | 'good' | 'gentle' | 'start'

export interface WeeklyRecap {
  thisWeekPct: number
  lastWeekPct: number | null
  deltaPct: number | null
  daysLoggedThisWeek: number
  tone: WeeklyRecapTone
}

// Acentos de tono — mirror del web (emerald-500 / brand / amber-500 / muted).
// Ember NO aplica aquí: el color sigue al tono, no al dominio.
const EMERALD_500 = '#10B981'
const AMBER_500 = '#F59E0B'

const TONE_COPY: Record<WeeklyRecapTone, { title: string; sub: string }> = {
  great: { title: '¡Semana sólida! 🔥', sub: 'Gran consistencia. Sigue con este ritmo.' },
  good: { title: 'Buen ritmo 💪', sub: 'Vas en camino — un poco más y la cierras redonda.' },
  gentle: { title: 'Semana tranquila', sub: 'Sin dramas. La próxima sumas unos días más y listo.' },
  start: { title: 'Arranca tu semana', sub: 'Registra tu primera comida para ver tu progreso aquí.' },
}

function shareText(recap: WeeklyRecap): string {
  const parts = [`Mi semana en nutrición: ${recap.thisWeekPct}% de adherencia`]
  parts.push(`${recap.daysLoggedThisWeek}/7 días registrados`)
  if (recap.deltaPct != null && recap.deltaPct > 0) parts.push(`+${recap.deltaPct}% vs la semana pasada 📈`)
  return `${parts.join(' · ')} 💪`
}

export function WeeklyRecapCard({ refreshSignal = 0 }: { refreshSignal?: number }) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const [recap, setRecap] = useState<WeeklyRecap | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ recap: WeeklyRecap | null }>('/api/mobile/nutrition/recap', { authenticated: true })
      .then((res) => {
        if (alive) setRecap(res.recap)
      })
      .catch(() => {
        if (alive) setRecap(null)
      })
    return () => {
      alive = false
    }
  }, [refreshSignal])

  if (!recap) return null

  const copy = TONE_COPY[recap.tone]
  const isStart = recap.tone === 'start'

  const toneAccent =
    recap.tone === 'great'
      ? EMERALD_500
      : recap.tone === 'good'
        ? theme.primary
        : recap.tone === 'gentle'
          ? AMBER_500
          : theme.mutedForeground

  const DeltaIcon =
    recap.deltaPct == null || recap.deltaPct === 0 ? Minus : recap.deltaPct > 0 ? TrendingUp : TrendingDown
  const deltaColor =
    recap.deltaPct == null || recap.deltaPct === 0
      ? theme.mutedForeground
      : recap.deltaPct > 0
        ? EMERALD_500
        : AMBER_500

  const onShare = () => {
    Share.share({ message: shareText(recap) }).catch(() => {})
  }

  return (
    <MotiView
      testID="weekly-recap-card"
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: motion.reduced ? 0 : 300 }}
      style={{
        borderRadius: theme.radius['2xl'],
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
      }}
    >
      <LinearGradient
        colors={[toneAccent + '1A', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, color: theme.foreground }}>{copy.title}</Text>
            <Text style={{ fontFamily: FONT.ui, fontSize: 12, color: theme.mutedForeground, marginTop: 2 }}>
              {copy.sub}
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              backgroundColor: theme.card + 'B3',
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text
              style={{
                fontFamily: FONT.uiBold,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: theme.mutedForeground,
              }}
            >
              Tu semana
            </Text>
          </View>
        </View>

        {!isStart && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 24, rowGap: 12, marginTop: 16 }}>
            <View>
              <Text
                style={{
                  fontFamily: FONT.uiBold,
                  fontSize: 10,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: theme.mutedForeground,
                }}
              >
                Adherencia · 7 días
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                <AnimatedNumber
                  value={recap.thisWeekPct}
                  format={(n) => `${Math.round(n)}%`}
                  style={{
                    fontFamily: FONT.displayBlack,
                    fontSize: 39,
                    letterSpacing: -1,
                    fontVariant: ['tabular-nums'],
                    color: toneAccent,
                  }}
                />
                {recap.deltaPct != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 6 }}>
                    <DeltaIcon size={14} color={deltaColor} strokeWidth={2.5} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, fontVariant: ['tabular-nums'], color: deltaColor }}>
                      {recap.deltaPct > 0 ? '+' : ''}
                      {recap.deltaPct}%
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
              <CalendarCheck size={16} color={theme.mutedForeground} strokeWidth={2} />
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, fontVariant: ['tabular-nums'], color: theme.foreground }}>
                {recap.daysLoggedThisWeek}
              </Text>
              <Text style={{ fontFamily: FONT.ui, fontSize: 14, color: theme.mutedForeground }}>de 7 días registrados</Text>
            </View>
          </View>
        )}

        {!isStart && (
          <TouchableOpacity
            testID="weekly-recap-share"
            accessibilityRole="button"
            accessibilityLabel="Compartir mi semana"
            onPress={onShare}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              gap: 6,
              minHeight: 44,
              paddingHorizontal: 14,
              marginTop: 16,
              borderRadius: theme.radius.xl,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.card + 'B3',
            }}
          >
            <Share2 size={14} color={theme.foreground} strokeWidth={2.25} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: theme.foreground }}>Compartir mi semana</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>
    </MotiView>
  )
}
