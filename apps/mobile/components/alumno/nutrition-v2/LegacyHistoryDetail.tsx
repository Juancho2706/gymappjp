import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { ChevronDown, History, Info } from 'lucide-react-native'
import {
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionLegacyHistoryDetailReadModel,
} from '@eva/nutrition-v2'
import { getNutritionLegacyHistoryDetailV2 } from '../../../lib/nutrition-v2.api'
import { useTheme } from '../../../context/ThemeContext'
import { NutritionCard } from '../../nutrition-v2'

/**
 * Detalle bajo demanda de V1 dentro de la experiencia V2. Es un lector aislado:
 * no muestra controles de escritura ni usa componentes/rutas del módulo anterior.
 */
export function LegacyHistoryDetail({ date }: { date: string }) {
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<NutritionLegacyHistoryDetailReadModel | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback(async () => {
    setExpanded(true)
    if (detail || loading) return

    setLoading(true)
    setError(null)
    try {
      setDetail(await getNutritionLegacyHistoryDetailV2({ date }))
    } catch {
      setError('No pudimos cargar el detalle anterior. Inténtalo otra vez.')
    } finally {
      setLoading(false)
    }
  }, [date, detail, loading])

  const hasContent =
    detail != null &&
    (detail.targets.length > 0 || detail.meals.length > 0 || detail.swaps.length > 0 || detail.intakeEntries.length > 0)

  return (
    <NutritionCard tone="warning">
      <Pressable
        accessibilityHint="Muestra el detalle de nutrición guardado antes de la versión actual"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="flex-row items-center justify-between gap-3"
        onPress={() => {
          if (expanded) setExpanded(false)
          else void open()
        }}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <History color={theme.warning} size={18} />
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-strong">Historial anterior</Text>
            <Text className="mt-0.5 text-xs text-muted">Sistema anterior · solo lectura</Text>
          </View>
        </View>
        {loading ? <ActivityIndicator color={theme.warning} /> : <ChevronDown color={theme.textSecondary} size={18} />}
      </Pressable>

      {expanded ? (
        <View className="mt-4 gap-4 border-t border-warning-500/20 pt-4">
          {loading ? <Text className="text-sm text-body">Cargando detalle…</Text> : null}
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => void open()}>
              <Text className="text-sm text-danger-500">{error}</Text>
            </Pressable>
          ) : null}
          {detail && !hasContent ? (
            <View className="flex-row items-start gap-2">
              <Info color={theme.textSecondary} size={16} />
              <Text className="flex-1 text-sm leading-5 text-body">
                Ese día quedó marcado en el sistema anterior, pero no guardó alimentos ni detalle adicional.
              </Text>
            </View>
          ) : null}
          {detail?.targets.map((target, index) => (
            <View key={`${target.planName ?? 'plan'}-${index}`}>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Objetivos anteriores{target.planName ? ` · ${target.planName}` : ''}
              </Text>
              <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
                {target.calories != null ? <Metric label="Energía" value={formatNutritionCalories(target.calories)} /> : null}
                {target.proteinG != null ? <Metric label="Proteína" value={formatNutritionAmount(target.proteinG, 'g')} /> : null}
                {target.carbsG != null ? <Metric label="Carbohidratos" value={formatNutritionAmount(target.carbsG, 'g')} /> : null}
                {target.fatsG != null ? <Metric label="Grasas" value={formatNutritionAmount(target.fatsG, 'g')} /> : null}
              </View>
            </View>
          ))}
          {detail?.meals.map((meal) => (
            <View key={meal.mealId}>
              <Text className="text-sm font-semibold text-strong">{meal.mealName}</Text>
              <Text className="mt-0.5 text-xs text-muted">
                Completada{meal.consumedQuantity != null ? ` · ${Math.round(meal.consumedQuantity)}%` : ''}
              </Text>
              {meal.foods.map((food) => (
                <Text key={food.foodId} className="mt-1 text-sm text-body">
                  {food.name}
                  {food.brand ? ` · ${food.brand}` : ''} · {formatNutritionAmount(food.quantity, food.unit ?? 'g')}
                </Text>
              ))}
            </View>
          ))}
          {detail?.swaps.length ? (
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Cambios registrados</Text>
              {detail.swaps.map((swap) => (
                <Text key={`${swap.mealId}-${swap.originalFoodId}-${swap.createdAt}`} className="mt-1 text-sm text-body">
                  {swap.originalFoodName} → {swap.swappedFoodName}
                  {swap.quantity != null ? ` · ${formatNutritionAmount(swap.quantity, swap.unit ?? 'g')}` : ''}
                </Text>
              ))}
            </View>
          ) : null}
          {detail?.intakeEntries.length ? (
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Registros anteriores</Text>
              {detail.intakeEntries.map((entry) => (
                <Text key={entry.entryId} className="mt-1 text-sm text-body">
                  {entry.foodName}
                  {entry.brand ? ` · ${entry.brand}` : ''} · {formatNutritionAmount(entry.quantity, entry.unit)}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </NutritionCard>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="font-display text-sm font-semibold text-strong">{value}</Text>
      <Text className="text-[11px] text-muted">{label}</Text>
    </View>
  )
}
