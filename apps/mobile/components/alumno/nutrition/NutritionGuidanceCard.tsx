import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { NotebookText, Pill } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import {
  getActiveNutritionGuidance,
  type NutritionGuidanceData,
} from '../../../lib/habits.queries'
import { EMBER_500, EMBER_700 } from './types'

/**
 * Indicaciones del profesional (suplementación + protocolo) del plan del alumno.
 *
 * NOTA (decisión CEO 2026-07-16): la comparación de SOLO LECTURA de hábitos del día
 * (agua / pasos / sueño / ayuno vs. metas del plan) se RETIRÓ de aquí por ser un
 * duplicado — el editor completo de hábitos vive en el dashboard (`HabitsCard`,
 * fuente editable). Este bloque conserva solo lo que NO estaba duplicado: las
 * indicaciones de suplementación y el protocolo que escribe el coach. Espeja 1:1
 * a la web (`NutritionGuidanceProgress`).
 */
interface Props {
  clientId: string
}

export function NutritionGuidanceCard({ clientId }: Props) {
  const { theme } = useTheme()
  const [guidance, setGuidance] = useState<NutritionGuidanceData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void getActiveNutritionGuidance(clientId)
      .then((nextGuidance) => {
        if (!active) return
        setGuidance(nextGuidance)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [clientId])

  if (loading) {
    return (
      <View style={{ minHeight: 58, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={EMBER_500} />
      </View>
    )
  }

  if (!guidance) return null

  const hasContent = guidance.supplement_guidance.length > 0 || Boolean(guidance.protocol_notes)
  if (!hasContent) return null

  return (
    <View
      accessibilityLabel="Indicaciones del profesional"
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
            Indicaciones del profesional
          </Text>
          <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 10.5, marginTop: 2, lineHeight: 15 }}>
            Lo que tu profesional te recomienda. No son recomendaciones automáticas.
          </Text>
        </View>
      </View>

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
