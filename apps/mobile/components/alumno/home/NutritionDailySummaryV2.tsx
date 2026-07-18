import { useCallback, useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Apple } from 'lucide-react-native'
import { createNutritionMacroValue, type NutritionTodayReadModel } from '@eva/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getTodayInSantiago } from '../../../lib/date-utils'
import { getNutritionTodayV2 } from '../../../lib/nutrition-v2.api'
import { Card } from '../../Card'
import { MacroBudget } from '../../nutrition-v2'

/**
 * Resumen del día de Nutrición V2 para el Home del alumno (surface mobileStudent). Espejo del
 * widget web `NutritionDailySummaryV2`: alimentado por el read model de HOY (`getNutritionTodayV2`),
 * reusa `MacroBudget` (energía consumida/meta + tres macros, paleta intacta) y navega a la
 * experiencia completa. Sin plan vigente => CTA suave. Solo lectura; el registro vive en
 * `/alumno/nutrition-v2`. Accentos white-label vía tokens (`bg-primary`, `text-primary`,
 * `theme.primary`); dark/claro automáticos.
 *
 * Se monta SOLO cuando el rollout `nutritionV2Student` está activo para el alumno (el Home
 * decide el gate). Refetch en cada foco del Home y ante pull-to-refresh (`reloadSignal`), igual
 * que la card V1; last-write-wins con `isIgnored`. Fail-safe: un read fallido conserva el último
 * estado y nunca rompe el Home.
 */
export function NutritionDailySummaryV2({
  clientId,
  onSeeAll,
  reloadSignal = 0,
}: {
  clientId: string
  onSeeAll: () => void
  reloadSignal?: number
}) {
  const { theme } = useTheme()
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  const [noPlan, setNoPlan] = useState(false)

  // Reset solo al cambiar de alumno (evita render stale del anterior mientras llega el fetch).
  useEffect(() => {
    setModel(null)
    setNoPlan(false)
  }, [clientId])

  useFocusEffect(
    useCallback(() => {
      let ignore = false
      void load(() => ignore)
      return () => {
        ignore = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, reloadSignal]),
  )

  async function load(isIgnored: () => boolean) {
    const { iso: date } = getTodayInSantiago()
    try {
      const fresh = await getNutritionTodayV2({ date })
      if (isIgnored()) return
      if (!fresh.plan) {
        setNoPlan(true)
        setModel(null)
        return
      }
      setNoPlan(false)
      setModel(fresh)
    } catch {
      // Silencioso: offline o rollout recién apagado no deben romper el Home; se conserva el
      // último estado renderizado (la tab de Nutrición y la web muestran el detalle real).
    }
  }

  if (noPlan) {
    return (
      <Card padding="lg" style={{ alignItems: 'center', gap: 8 }}>
        <Apple size={40} color={theme.mutedForeground} strokeWidth={1.75} />
        <Text className="text-strong font-sans-bold" style={{ fontSize: 14 }}>
          Aún no tienes un plan
        </Text>
        <Text className="text-muted font-sans" style={{ fontSize: 12, textAlign: 'center' }}>
          Cuando tu coach publique tu plan, verás aquí tu resumen del día.
        </Text>
        <TouchableOpacity
          testID="nutrition-v2-see-all"
          onPress={onSeeAll}
          activeOpacity={0.82}
          className="rounded-control border border-primary/30 bg-primary/10"
          style={{ marginTop: 4, paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text className="text-primary" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>
            Ver nutrición
          </Text>
        </TouchableOpacity>
      </Card>
    )
  }

  if (!model) return null

  const { consumed, targets } = model

  return (
    <Card padding="md" style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
          <View
            className="bg-primary/10"
            style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
          >
            <Apple size={18} color={theme.primary} strokeWidth={2.25} />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text className="text-strong font-sans-bold" numberOfLines={1} style={{ fontSize: 14 }}>
              {model.plan?.name}
            </Text>
            <Text
              className="text-subtle"
              style={{ fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}
            >
              Hoy
            </Text>
          </View>
        </View>
        <TouchableOpacity testID="nutrition-v2-see-all" onPress={onSeeAll} activeOpacity={0.7}>
          <Text className="text-primary" style={{ fontFamily: FONT.uiBold, fontSize: 11 }}>
            Ver todo →
          </Text>
        </TouchableOpacity>
      </View>

      <MacroBudget
        calories={{ consumed: consumed.calories, target: targets.calories ?? 0 }}
        macros={[
          createNutritionMacroValue('protein', { consumed: consumed.proteinG, target: targets.proteinG ?? 0 }),
          createNutritionMacroValue('carbs', { consumed: consumed.carbsG, target: targets.carbsG ?? 0 }),
          createNutritionMacroValue('fats', { consumed: consumed.fatsG, target: targets.fatsG ?? 0 }),
        ]}
        compact
      />

      <TouchableOpacity
        onPress={onSeeAll}
        activeOpacity={0.82}
        className="rounded-control border border-primary/30 bg-primary/10"
        style={{ paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' }}
      >
        <Text className="text-primary" style={{ fontFamily: FONT.uiBold, fontSize: 12 }}>
          Ver nutrición →
        </Text>
      </TouchableOpacity>
    </Card>
  )
}
