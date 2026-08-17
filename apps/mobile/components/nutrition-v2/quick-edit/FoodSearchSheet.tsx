import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Plus, Search } from 'lucide-react-native'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { Sheet } from '../../Sheet'
import { MacroSparkPopover } from '../MacroSparkPopover'
import { FoodThumbnail } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { searchFoodCatalogV2 } from '../../../lib/nutrition-v2-catalog.api'
import { foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import { EDITOR_COPY, QUICK_EDIT_COPY } from './microcopy'

export type FoodSearchMode = 'add' | 'swap' | 'substitution'

/**
 * Buscador de catalogo del quick-edit en Sheet nativeModal (gorhom vetado bajo
 * reanimated 4 — patron QA-12). Sirve tres flujos: agregar alimento a una franja
 * (con fallback "Alimento libre"), swap de una fila existente (qe-design §1.2.B.1:
 * elegir alimento reemplaza food/nombre/macros conservando cantidad y unidad) y —solo en el
 * editor unico— agregar un REEMPLAZO autorizado al item (T3.3b, capacidad W2 del editor web).
 */

const MODE_TITLE: Record<FoodSearchMode, string> = {
  add: QUICK_EDIT_COPY.addFood,
  swap: QUICK_EDIT_COPY.swapFood,
  substitution: EDITOR_COPY.addSubstitution,
}

const MODE_VERB: Record<FoodSearchMode, string> = {
  add: 'Agregar',
  swap: 'Reemplazar por',
  substitution: 'Autorizar',
}

/**
 * Base declarada de los macros de la fila, tal cual la escribe el picker web (NUT-001): el
 * catalogo tiene DOS convenciones vivas y las filas `per_serving` (seed de intercambios) traen
 * los macros de la PORCION, no de 100 g — imprimir «por 100 g» ahi seria una mentira visual.
 * Sin base declarada rige la regla historica (`per_100`); nunca se inventa la otra.
 */
function foodBasisLabel(food: FoodCatalogItem): string {
  const unitLabel = food.servingUnit === 'ml' ? 'ml' : 'g'
  if (food.macrosBasis !== 'per_serving') return `por 100 ${unitLabel}`
  const size = food.servingSize
  const amount = Number.isInteger(size) ? String(size) : size.toFixed(1)
  return `por ${amount} ${unitLabel}`
}

export function FoodSearchSheet({
  open,
  mode,
  onClose,
  onSelect,
  onFreeItem,
}: {
  open: boolean
  mode: FoodSearchMode
  onClose: () => void
  onSelect: (food: FoodCatalogItem) => void
  onFreeItem?: () => void
}) {
  const { theme } = useTheme()
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setItems([])
      setTouched(false)
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (!open || trimmed.length < 2) {
      setItems([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTouched(true)
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchFoodCatalogV2({ query: trimmed, surface: 'coach', signal: controller.signal })
          if (mountedRef.current) setItems(res.items)
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          if (mountedRef.current) setItems([])
        } finally {
          if (mountedRef.current) setLoading(false)
        }
      })()
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query, open])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      nativeModal
      snapPoints={['85%']}
      title={MODE_TITLE[mode]}
      accessibilityLabel={MODE_TITLE[mode]}
    >
      <View className="flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
        <Search color={theme.mutedForeground} size={16} />
        <TextInput
          accessibilityLabel="Buscar alimento"
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar alimento…"
          placeholderTextColor={theme.mutedForeground}
          className="min-h-11 flex-1 py-2 text-base text-strong"
        />
      </View>

      {mode === 'add' && onFreeItem ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={QUICK_EDIT_COPY.freeFood}
          onPress={onFreeItem}
          className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-default bg-surface-sunken px-3"
        >
          <Plus color={theme.foreground} size={15} />
          <Text className="text-sm font-semibold text-strong">{QUICK_EDIT_COPY.freeFood}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : items.length === 0 ? (
        <Text className="px-1 py-6 text-center text-sm text-muted">
          {touched && query.trim().length >= 2 ? 'Sin resultados.' : 'Escribe al menos 2 letras para buscar.'}
        </Text>
      ) : (
        <View className="gap-2">
          {/*
            Fila v2 del picker (T3.v Cabina, espejo de `FoodPickerRow` web): foto + identidad +
            MacroSpark con los gramos a un tap. REGLA DURA del dueño (2026-08-05): todo alimento
            individual muestra SIEMPRE kcal · P · C · G — la barra resume por aporte calórico y
            el popover trae los gramos exactos, así que la fila nunca se recorta a "kcal solo".

            El trigger del popover es su propio Pressable: por eso la identidad y el spark son
            HERMANOS (misma decisión que el picker web) en vez de anidarse dentro del pressable
            de alta — un tap en la barra abriría el panel Y agregaría el alimento.
          */}
          {items.map((food) => (
            <View
              key={food.id}
              className="flex-row items-center gap-2 rounded-control border border-subtle bg-surface-card pr-3"
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${MODE_VERB[mode]} ${food.name}`}
                onPress={() => onSelect(food)}
                className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3 py-2.5 pl-3"
              >
                <FoodThumbnail
                  alt={food.name}
                  src={foodMediaThumbnailUrl(food.media)}
                  fallbackCategory={food.category}
                  size="sm"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-strong" numberOfLines={2}>
                    {food.name}
                  </Text>
                  {food.brand ? (
                    <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                      {food.brand}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <MacroSparkPopover
                size="sm"
                className="shrink-0"
                ariaContext={food.name}
                calories={food.calories}
                proteinG={food.proteinG}
                carbsG={food.carbsG}
                fatsG={food.fatsG}
                fiberG={food.fiberG}
                basisLabel={foodBasisLabel(food)}
              />
            </View>
          ))}
        </View>
      )}
    </Sheet>
  )
}
