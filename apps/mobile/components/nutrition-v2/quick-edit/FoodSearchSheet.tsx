import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Plus, Search } from 'lucide-react-native'
import type { FoodCatalogItem } from '@eva/nutrition-v2'
import { Sheet } from '../../Sheet'
import { FoodThumbnail } from '../NutritionV2Kit'
import { useTheme } from '../../../context/ThemeContext'
import { searchFoodCatalogV2 } from '../../../lib/nutrition-v2-catalog.api'
import { foodCategoryEmoji, foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import { QUICK_EDIT_COPY } from './microcopy'

export type FoodSearchMode = 'add' | 'swap'

/**
 * Buscador de catalogo del quick-edit en Sheet nativeModal (gorhom vetado bajo
 * reanimated 4 — patron QA-12). Sirve dos flujos: agregar alimento a una franja
 * (con fallback "Alimento libre") y swap de una fila existente (qe-design §1.2.B.1:
 * elegir alimento reemplaza food/nombre/macros conservando cantidad y unidad).
 */
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
      title={mode === 'swap' ? QUICK_EDIT_COPY.swapFood : QUICK_EDIT_COPY.addFood}
      accessibilityLabel={mode === 'swap' ? QUICK_EDIT_COPY.swapFood : QUICK_EDIT_COPY.addFood}
    >
      <View className="flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
        <Search color={theme.mutedForeground} size={16} />
        <TextInput
          accessibilityLabel="Buscar alimento"
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar alimento…"
          placeholderTextColor={theme.mutedForeground}
          className="min-h-11 flex-1 py-2 text-base text-text-strong"
        />
      </View>

      {mode === 'add' && onFreeItem ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={QUICK_EDIT_COPY.freeFood}
          onPress={onFreeItem}
          className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-sunken px-3"
        >
          <Plus color={theme.foreground} size={15} />
          <Text className="text-sm font-semibold text-text-strong">{QUICK_EDIT_COPY.freeFood}</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View className="items-center py-8">
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : items.length === 0 ? (
        <Text className="px-1 py-6 text-center text-sm text-text-muted">
          {touched && query.trim().length >= 2 ? 'Sin resultados.' : 'Escribe al menos 2 letras para buscar.'}
        </Text>
      ) : (
        <View className="gap-2">
          {items.map((food) => (
            <Pressable
              key={food.id}
              accessibilityRole="button"
              accessibilityLabel={`${mode === 'swap' ? 'Reemplazar por' : 'Agregar'} ${food.name}`}
              onPress={() => onSelect(food)}
              className="min-h-14 flex-row items-center gap-3 rounded-control border border-border-subtle bg-surface-card px-3 py-2.5"
            >
              <FoodThumbnail
                alt={food.name}
                src={foodMediaThumbnailUrl(food.media)}
                fallbackEmoji={foodCategoryEmoji(food.category)}
                size="sm"
              />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-text-strong" numberOfLines={2}>
                  {food.name}
                </Text>
                <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                  {[food.brand, `${Math.round(food.calories)} kcal / ${food.servingSize}${food.servingUnit}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  )
}
