import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { Droplets, Footprints, Moon, NotebookText, Pill, TimerReset } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import {
  getActiveNutritionGuidance,
  getDailyHabits,
  type HabitsData,
  type NutritionGuidanceData,
} from '../../../lib/habits.queries'
import { EMBER_500, EMBER_700 } from './types'

interface Props {
  clientId: string
  logDate: string
}

function targetPercent(value: number | null | undefined, target: number | null | undefined): number {
  if (!target || target <= 0 || value == null) return 0
  return Math.max(0, Math.round((Number(value) / Number(target)) * 100))
}

function Goal({
  label,
  value,
  target,
  unit,
  icon,
}: {
  label: string
  value: number | null | undefined
  target: number
  unit: string
  icon: React.ReactNode
}) {
  const { theme } = useTheme()
  const percent = targetPercent(value, target)
  return (
    <View
      style={{
        width: '48.5%',
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.background,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ color: EMBER_700, fontFamily: FONT.uiExtra, fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {label}
        </Text>
      </View>
      <Text style={{ color: theme.foreground, fontFamily: FONT.monoBold, fontSize: 14, marginTop: 9 }}>
        {value == null ? '—' : Number(value).toLocaleString('es-CL')}
        <Text style={{ color: theme.mutedForeground, fontFamily: FONT.monoMedium, fontSize: 9.5 }}>
          {' '} / {Number(target).toLocaleString('es-CL')} {unit}
        </Text>
      </Text>
      <View style={{ height: 6, borderRadius: 999, backgroundColor: theme.muted, overflow: 'hidden', marginTop: 9 }}>
        <View style={{ width: `${Math.min(percent, 100)}%`, height: 6, borderRadius: 999, backgroundColor: EMBER_500 }} />
      </View>
      <Text style={{ color: theme.mutedForeground, fontFamily: FONT.monoBold, fontSize: 9, textAlign: 'right', marginTop: 4 }}>
        {percent}%
      </Text>
    </View>
  )
}

export function NutritionGuidanceCard({ clientId, logDate }: Props) {
  const { theme } = useTheme()
  const [guidance, setGuidance] = useState<NutritionGuidanceData | null>(null)
  const [habits, setHabits] = useState<HabitsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void Promise.all([
      getActiveNutritionGuidance(clientId),
      getDailyHabits(clientId, logDate),
    ]).then(([nextGuidance, nextHabits]) => {
      if (!active) return
      setGuidance(nextGuidance)
      setHabits(nextHabits)
      setLoading(false)
    }).catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
    }
  }, [clientId, logDate])

  if (loading) {
    return (
      <View style={{ minHeight: 58, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={EMBER_500} />
      </View>
    )
  }

  if (!guidance) return null

  const goals = [
    guidance.hydration_target_ml
      ? { key: 'water', label: 'Agua', value: habits?.water_ml, target: guidance.hydration_target_ml, unit: 'ml', icon: <Droplets size={15} color={EMBER_500} /> }
      : null,
    guidance.steps_target
      ? { key: 'steps', label: 'Pasos', value: habits?.steps, target: guidance.steps_target, unit: 'pasos', icon: <Footprints size={15} color={EMBER_500} /> }
      : null,
    guidance.sleep_target_hours
      ? { key: 'sleep', label: 'Sueño', value: habits?.sleep_hours, target: guidance.sleep_target_hours, unit: 'h', icon: <Moon size={15} color={EMBER_500} /> }
      : null,
    guidance.fasting_target_hours
      ? { key: 'fasting', label: 'Ayuno', value: habits?.fasting_hours, target: guidance.fasting_target_hours, unit: 'h', icon: <TimerReset size={15} color={EMBER_500} /> }
      : null,
  ].filter((goal): goal is NonNullable<typeof goal> => goal !== null)

  const hasContent = goals.length > 0
    || guidance.supplement_guidance.length > 0
    || Boolean(guidance.protocol_notes)
  if (!hasContent) return null

  return (
    <View
      accessibilityLabel="Objetivos del profesional"
      style={{
        borderRadius: theme.radius['2xl'],
        borderWidth: 1,
        borderColor: `${EMBER_500}40`,
        backgroundColor: theme.card,
        padding: 16,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <NotebookText size={17} color={EMBER_500} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 16.5 }}>
            Objetivos del profesional
          </Text>
          <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 10.5, marginTop: 2, lineHeight: 15 }}>
            Se comparan con los hábitos que registras en EVA. No son recomendaciones automáticas.
          </Text>
        </View>
      </View>

      {goals.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {goals.map(({ key, ...goal }) => <Goal key={key} {...goal} />)}
        </View>
      ) : null}

      {guidance.supplement_guidance.length > 0 ? (
        <View style={{ borderRadius: theme.radius.lg, backgroundColor: theme.muted, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Pill size={15} color={EMBER_500} />
            <Text style={{ color: EMBER_700, fontFamily: FONT.uiExtra, fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase' }}>
              Indicaciones
            </Text>
          </View>
          <View style={{ gap: 5, marginTop: 8 }}>
            {guidance.supplement_guidance.map((item) => (
              <View key={item} style={{ flexDirection: 'row', gap: 7 }}>
                <Text style={{ color: EMBER_500, fontFamily: FONT.uiBold, fontSize: 12 }}>•</Text>
                <Text style={{ flex: 1, color: theme.foreground, fontFamily: FONT.ui, fontSize: 12, lineHeight: 17 }}>
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {guidance.protocol_notes ? (
        <View style={{ borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.border, padding: 12 }}>
          <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold, fontSize: 12 }}>
            Protocolo y recomendaciones
          </Text>
          <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12, lineHeight: 18, marginTop: 6 }}>
            {guidance.protocol_notes}
          </Text>
        </View>
      ) : null}
    </View>
  )
}
