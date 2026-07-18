import { useEffect, useMemo, useState } from 'react'
import { Share, Text, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { CalendarCheck, Minus, Share2, TrendingDown, TrendingUp } from 'lucide-react-native'
import { MotiView } from 'moti'
import {
  computeNutritionAdherence,
  type AdherenceMeal,
  type MealLogRow,
} from '@eva/nutrition-engine'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
import { getNutritionDayOfWeekFromIsoYmd, getTodayInSantiago, isoDateAddDays } from '../../../lib/date-utils'
import { AnimatedNumber } from '../../AnimatedNumber'
import type { AdherenceDay } from './types'

/**
 * WeeklyRecapCard (E4-14) — recap semanal motivacional del alumno, espejo del web
 * `nutrition/_components/WeeklyRecapCard`. Cifra AUDITABLE (mismo motor
 * `computeNutritionAdherence`: ventana últimos 7d vs los 7 previos). Tono
 * ADAPTATIVO (gentil en semana floja, SIN culpa ni presión). Comparte a apps
 * nativas vía `Share`. Números y copy IDÉNTICOS a la web.
 *
 * Doble fuente (fail-invisible): intenta `/api/mobile/nutrition/recap` (verdad del
 * server, read-only); si el endpoint NO existe todavía en el backend desplegado
 * (404/red), DERIVA el recap LOCALMENTE con el MISMO motor y las MISMAS ventanas
 * (hoy-6..hoy vs hoy-13..hoy-7) sobre los 30 días de adherencia ya cargados por el
 * shell — cifras y umbrales byte-idénticos, cero sección rota. Sin `plan`/adherencia
 * (sin plan activo) → no renderiza, igual que la web omite la sección. Acepta
 * `refreshSignal` para re-derivar al pull-to-refresh del shell.
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

/** Plan mínimo para derivar el recap (basta id + day_of_week de cada comida). */
type RecapPlan = { nutrition_meals: { id: string; day_of_week: number | null }[] }

/**
 * Deriva el recap LOCALMENTE con el motor canónico — espejo EXACTO de
 * `getNutritionWeeklyRecap` (web): mismas ventanas (hoy-6..hoy vs hoy-13..hoy-7),
 * mismo redondeo/cap y mismos umbrales de tono. El compliancePct depende SOLO de
 * comidas completadas × aplicabilidad por `day_of_week`, así que basta la adherencia
 * de 30d (food_items/targets no alteran la cifra). Fallback usado cuando el endpoint
 * aún no existe en el backend desplegado — cifras byte-idénticas al server.
 */
function deriveWeeklyRecap(
  plan: RecapPlan | null | undefined,
  adherence: AdherenceDay[] | undefined,
  todayIso: string
): WeeklyRecap | null {
  if (!plan) return null

  const meals: AdherenceMeal[] = plan.nutrition_meals.map((m) => ({
    id: m.id,
    day_of_week: m.day_of_week ?? null,
    food_items: [],
  }))

  const logsByDate = new Map<string, MealLogRow[]>()
  for (const day of adherence ?? []) {
    logsByDate.set(
      day.log_date,
      (day.nutrition_meal_logs ?? []).map((r) => ({ meal_id: r.meal_id, is_completed: r.is_completed }))
    )
  }

  // startDaysAgo = extremo más lejano (start), endDaysAgo = más cercano a hoy (end).
  const runWindow = (startDaysAgo: number, endDaysAgo: number) =>
    computeNutritionAdherence({
      meals,
      logsByDate,
      liveTarget: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      range: { startIso: isoDateAddDays(todayIso, -startDaysAgo), endIso: isoDateAddDays(todayIso, -endDaysAgo) },
      dayOfWeekResolver: getNutritionDayOfWeekFromIsoYmd,
    })

  const thisAgg = runWindow(6, 0) // hoy-6 .. hoy
  const lastAgg = runWindow(13, 7) // hoy-13 .. hoy-7

  const thisWeekPct = Math.min(100, Math.round(thisAgg.summary.compliancePct))
  const daysLoggedThisWeek = thisAgg.perDay.filter((d) => d.hasLog).length
  const lastWeekHasData = lastAgg.perDay.some((d) => d.hasLog)
  const lastWeekPct = lastWeekHasData ? Math.min(100, Math.round(lastAgg.summary.compliancePct)) : null
  const deltaPct = lastWeekPct != null ? thisWeekPct - lastWeekPct : null

  const tone: WeeklyRecapTone =
    daysLoggedThisWeek === 0 ? 'start' : thisWeekPct >= 85 ? 'great' : thisWeekPct >= 60 ? 'good' : 'gentle'

  return { thisWeekPct, lastWeekPct, deltaPct, daysLoggedThisWeek, tone }
}

export function WeeklyRecapCard({
  refreshSignal = 0,
  plan = null,
  adherence,
}: {
  refreshSignal?: number
  /** Plan activo del shell (para el fallback local si el endpoint 404ea). */
  plan?: RecapPlan | null
  /** Adherencia 30d ya cargada por el shell (fuente del fallback local). */
  adherence?: AdherenceDay[]
}) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const { iso: todayIso } = getTodayInSantiago()
  const [serverRecap, setServerRecap] = useState<WeeklyRecap | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ recap: WeeklyRecap | null }>('/api/mobile/nutrition/recap', { authenticated: true })
      .then((res) => {
        if (alive) setServerRecap(res.recap)
      })
      .catch(() => {
        // Endpoint no desplegado (404) o red caída → sin verdad de server; cae al local.
        if (alive) setServerRecap(null)
      })
    return () => {
      alive = false
    }
  }, [refreshSignal])

  // Fallback local (siempre disponible con plan cargado). El server, cuando exista,
  // gana — pero produce las MISMAS cifras (mismo motor + ventanas), así que es invisible.
  const localRecap = useMemo(
    () => deriveWeeklyRecap(plan, adherence, todayIso),
    [plan, adherence, todayIso]
  )
  const recap = serverRecap ?? localRecap

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
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 6, flexShrink: 1 }}>
                    <DeltaIcon size={14} color={deltaColor} strokeWidth={2.5} />
                    <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, fontVariant: ['tabular-nums'], color: deltaColor, flexShrink: 1 }}>
                      {recap.deltaPct > 0 ? '+' : ''}
                      {recap.deltaPct}% vs. semana anterior
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
