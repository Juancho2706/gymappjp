import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { ChevronLeft, Search, Star } from 'lucide-react-native'
import {
  FoodRow,
  MacroChipRow,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionStatePanel,
  SyncOfflineState,
  CelebrationOverlay,
  type CelebrationInstance,
} from '../../../../components/nutrition-v2'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../../components/alumno/AlumnoMobileChrome'
import { useAlumnoScrollHandler } from '../../../../lib/alumno-chrome-scroll'
import { sortFoodsByFavoriteFirst, type FoodCatalogItem } from '@eva/nutrition-v2'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements } from '../../../../lib/entitlements'
import { supabase } from '../../../../lib/supabase'
import { searchFoodCatalogV2 } from '../../../../lib/nutrition-v2-catalog.api'
import {
  getClientFoodFavorites,
  listFavoriteFoodsV2,
  toggleClientFoodFavorite,
} from '../../../../lib/nutrition-swaps'
import {
  CATALOG_ODBL_GENERIC_LINE,
  catalogHasOpenFoodFactsSource,
  foodCategoryEmoji,
  foodMediaThumbnailUrl,
  foodOdblAttributionLine,
} from '../../../../lib/nutrition-v2-food-media'
import {
  buildRecordIntakeMutation,
  computeIntakeTotals,
} from '../../../../lib/nutrition-v2-intake'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitRecordIntake,
} from '../../../../lib/nutrition-v2-intake-runner'
import { decideMealLoggedCelebration, type CelebrationDecision } from '../../../../lib/nutrition-v2-celebrations'
import { claimMealLoggedCelebration } from '../../../../lib/nutrition-v2-celebrations.storage'

const SEARCH_DEBOUNCE_MS = 300

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function unitsFor(food: FoodCatalogItem): readonly string[] {
  return food.servingUnit === 'ml' ? ['ml', 'un'] : ['g', 'un']
}

export default function NutritionV2AddFoodScreen() {
  const router = useRouter()
  // 4A-01: pantalla bajo (tabs) con la cápsula visible — el scroll reserva el
  // clearance de la cápsula y alimenta su minimizado (patrón de las demás tabs).
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const entitlements = useEntitlements()
  const params = useLocalSearchParams<{ slot?: string; slotName?: string }>()
  const slotCode = typeof params.slot === 'string' && params.slot ? params.slot : null
  const slotName = typeof params.slotName === 'string' && params.slotName ? params.slotName : null

  const [userId, setUserId] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<FoodCatalogItem | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteFoods, setFavoriteFoods] = useState<FoodCatalogItem[]>([])
  const [favBusyId, setFavBusyId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState('g')
  const [assignSlot, setAssignSlot] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'queued' | 'error'>('idle')
  const [celebration, setCelebration] = useState<CelebrationInstance | null>(null)
  const celebrationNonce = useRef(0)
  const fireCelebration = useCallback((decision: CelebrationDecision) => {
    celebrationNonce.current += 1
    setCelebration({ ...decision, nonce: celebrationNonce.current })
  }, [])

  const date = useMemo(todayInSantiago, [])
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')

  const mountedRef = useRef(true)
  const searchControllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      searchControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    void getStableDeviceId().then((id) => {
      if (active) setDeviceId(id)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (selected) return
    const normalized = term.trim()
    if (normalized.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchControllerRef.current?.abort()
      const controller = new AbortController()
      searchControllerRef.current = controller
      searchFoodCatalogV2({ query: normalized, surface: 'student', signal: controller.signal })
        .then((page) => {
          if (!cancelled && mountedRef.current) setResults(page.items)
        })
        .catch(() => {
          if (!cancelled && mountedRef.current) setResults([])
        })
        .finally(() => {
          if (!cancelled && mountedRef.current) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected, term])

  // Favoritos del alumno (misma tabla V1 `client_food_preferences`): ids para la estrella y el
  // orden, y foods hidratados para el acceso rápido "Tus favoritos" con el buscador vacío.
  useEffect(() => {
    if (!userId) return
    let active = true
    void getClientFoodFavorites(userId).then((ids) => {
      if (active) setFavoriteIds(ids)
    })
    void listFavoriteFoodsV2(userId).then((foods) => {
      if (active) setFavoriteFoods(foods)
    })
    return () => {
      active = false
    }
  }, [userId])

  const pickFood = useCallback((food: FoodCatalogItem) => {
    void Haptics.selectionAsync()
    setSelected(food)
    const nextUnit = food.servingUnit === 'ml' ? 'ml' : 'g'
    setUnit(nextUnit)
    setQuantity(String(food.servingSize > 0 ? food.servingSize : 100))
  }, [])

  // Toggle optimista con rollback: la estrella cambia al instante; si el server falla, revierte
  // el id y la lista de favoritos. Reusa `toggleClientFoodFavorite` (allergy/intolerance-safe).
  const toggleFavorite = useCallback((food: FoodCatalogItem) => {
    if (!userId) return
    void Haptics.selectionAsync()
    const wasFav = favoriteIds.has(food.id)
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (wasFav) next.delete(food.id)
      else next.add(food.id)
      return next
    })
    setFavoriteFoods((prev) => {
      if (wasFav) return prev.filter((f) => f.id !== food.id)
      return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
    })
    setFavBusyId(food.id)
    void toggleClientFoodFavorite({ clientId: userId, foodId: food.id }).then((res) => {
      if (!mountedRef.current) return
      setFavBusyId((cur) => (cur === food.id ? null : cur))
      if (!res.success) {
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (wasFav) next.add(food.id)
          else next.delete(food.id)
          return next
        })
        setFavoriteFoods((prev) => {
          if (wasFav) return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
          return prev.filter((f) => f.id !== food.id)
        })
      }
    })
  }, [favoriteIds, userId])

  // Favoritos PRIMERO en los resultados (reordena en cliente, sin tocar la búsqueda).
  const orderedResults = useMemo(() => sortFoodsByFavoriteFirst(results, favoriteIds), [results, favoriteIds])
  const showFavoritesShortcut = term.trim().length < 2 && favoriteFoods.length > 0

  const parsedQuantity = Number(quantity.replace(',', '.'))
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
  const preview = useMemo(() => {
    if (!selected || !validQuantity) return null
    return computeIntakeTotals(parsedQuantity, unit, {
      calories: selected.calories,
      proteinG: selected.proteinG,
      carbsG: selected.carbsG,
      fatsG: selected.fatsG,
      fiberG: selected.fiberG,
      servingSize: selected.servingSize,
    })
  }, [parsedQuantity, selected, unit, validQuantity])

  const save = useCallback(async () => {
    if (!userId || !deviceId || !selected || saving || !validQuantity) return
    setSaving(true)
    setSaveState('idle')
    try {
      const payload = buildRecordIntakeMutation({
        clientId: userId,
        deviceId,
        operationId: newNutritionV2OperationId(),
        localDate: date,
        occurredAt: new Date().toISOString(),
        timezone: 'America/Santiago',
        foodId: selected.id,
        quantity: parsedQuantity,
        unit,
        mealSlot: assignSlot ? slotCode : null,
        source: 'offplan',
        captureMethod: 'search',
        snapshot: {
          name: selected.name,
          brand: selected.brand,
          calories: selected.calories,
          proteinG: selected.proteinG,
          carbsG: selected.carbsG,
          fatsG: selected.fatsG,
          fiberG: selected.fiberG,
          servingSize: selected.servingSize,
          servingUnit: selected.servingUnit,
        },
      })
      const outcome = await submitRecordIntake(userId, payload)
      if (!mountedRef.current) return
      if (outcome.status === 'recorded' || outcome.status === 'queued') {
        void Haptics.notificationAsync(
          outcome.status === 'recorded'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        )
        const claimed = await claimMealLoggedCelebration(userId, date)
        const decision = decideMealLoggedCelebration(!claimed)
        if (decision && mountedRef.current) {
          fireCelebration(decision)
          setTimeout(() => {
            if (mountedRef.current) router.back()
          }, 1300)
        } else {
          router.back()
        }
        return
      }
      setSaveState('error')
    } catch {
      if (mountedRef.current) setSaveState('error')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [assignSlot, date, deviceId, fireCelebration, parsedQuantity, router, saving, selected, slotCode, unit, userId, validQuantity])

  if (!entitlements.ready) {
    return <View className="flex-1 bg-surface-app" />
  }

  if (!enabled) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="El registro todavía no está disponible"
          description="Tu coach todavía no activó esta vista para ti."
          action={
            <NutritionMotionButton
              accessibilityLabel="Volver a nutrición actual"
              onPress={() => router.replace('/alumno/(tabs)/nutricion')}
              tone="neutral"
            >
              Volver a Nutrición
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pt-5"
      contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-control border border-border-subtle bg-surface-card"
        >
          <ChevronLeft color="#818C9A" size={22} />
        </Pressable>
        <View className="flex-1">
          <NutritionHeader
            eyebrow="Registrar"
            title="Agregar alimento"
            description={slotName ? `A ${slotName} · hoy` : 'Consumo real de hoy'}
          />
        </View>
      </View>

      {!selected ? (
        <>
          <NutritionCard>
            <View className="flex-row items-center gap-3">
              <Search color="#818C9A" size={19} />
              <TextInput
                accessibilityLabel="Buscar alimento"
                autoCorrect={false}
                className="min-h-11 flex-1 text-base text-text-strong"
                onChangeText={setTerm}
                placeholder="Buscar pollo, arroz, yogur…"
                placeholderTextColor="#818C9A"
                value={term}
              />
            </View>
          </NutritionCard>

          <NutritionMotionButton
            accessibilityLabel="Escanear código de barras"
            tone="neutral"
            onPress={() => router.push('/alumno/nutrition-v2/scanner')}
          >
            Escanear código
          </NutritionMotionButton>

          {term.trim().length < 2 ? (
            showFavoritesShortcut ? (
              <View className="gap-2">
                <View className="flex-row items-center gap-1.5">
                  <Star size={14} color="#FBBF24" fill="#FBBF24" />
                  <Text className="text-xs font-semibold text-text-muted">Tus favoritos</Text>
                </View>
                <View className="rounded-card border border-border-subtle bg-surface-card">
                  {favoriteFoods.map((food, index) => (
                    <CatalogPickRow
                      key={food.id}
                      food={food}
                      index={index}
                      isFavorite={favoriteIds.has(food.id)}
                      favBusy={favBusyId === food.id}
                      onPick={pickFood}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </View>
              </View>
            ) : (
              <NutritionStatePanel
                icon="info"
                title="Busca en el catálogo de EVA"
                description="Escribe al menos dos letras. Consultamos el catálogo local, sin llamadas externas."
              />
            )
          ) : searching ? (
            <NutritionStatePanel icon="info" title="Buscando…" description="Consultando el catálogo de EVA." />
          ) : results.length === 0 ? (
            <NutritionStatePanel
              icon="empty"
              title={`Sin resultados para “${term.trim()}”`}
              description="Prueba con otra palabra, una marca, o escanea el código del producto."
            />
          ) : (
            <>
              <View className="rounded-card border border-border-subtle bg-surface-card">
                {orderedResults.map((food, index) => (
                  <CatalogPickRow
                    key={food.id}
                    food={food}
                    index={index}
                    isFavorite={favoriteIds.has(food.id)}
                    favBusy={favBusyId === food.id}
                    onPick={pickFood}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </View>
              {catalogHasOpenFoodFactsSource(orderedResults) ? (
                <Text className="text-[10px] text-text-subtle">{CATALOG_ODBL_GENERIC_LINE}</Text>
              ) : null}
            </>
          )}
        </>
      ) : (
        <View className="gap-5">
          <NutritionCard tone="nutrition">
            <Text className="font-display text-xl font-semibold text-text-strong" numberOfLines={2}>
              {selected.name}
            </Text>
            {selected.brand ? <Text className="mt-1 text-sm text-text-muted">{selected.brand}</Text> : null}
            {foodOdblAttributionLine(selected.source) ? (
              <Text className="mt-1 text-[10px] text-text-subtle">{foodOdblAttributionLine(selected.source)}</Text>
            ) : null}

            <View className="mt-4 flex-row items-center gap-2">
              <TextInput
                accessibilityLabel="Cantidad"
                className="min-h-12 w-28 rounded-control border border-border-default bg-surface-app px-3 text-lg text-text-strong"
                inputMode="decimal"
                keyboardType="decimal-pad"
                onChangeText={setQuantity}
                selectTextOnFocus
                value={quantity}
              />
              <View className="flex-1 flex-row gap-2">
                {unitsFor(selected).map((value) => {
                  const active = unit === value
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Unidad ${value}`}
                      onPress={() => {
                        void Haptics.selectionAsync()
                        setUnit(value)
                      }}
                      className={`min-h-12 flex-1 items-center justify-center rounded-control border ${active ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-app'}`}
                    >
                      <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>{value}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {slotCode ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: assignSlot }}
                accessibilityLabel={`Asignar a ${slotName ?? 'la franja'}`}
                onPress={() => setAssignSlot((value) => !value)}
                className="mt-3 flex-row items-center justify-between rounded-control border border-border-subtle bg-surface-app px-3 py-3"
              >
                <Text className="text-sm text-text-body">Asignar a {slotName ?? 'la franja'}</Text>
                <View className={`h-6 w-11 justify-center rounded-pill px-0.5 ${assignSlot ? 'bg-primary' : 'bg-surface-sunken'}`}>
                  <View className={`h-5 w-5 rounded-full bg-white ${assignSlot ? 'self-end' : 'self-start'}`} />
                </View>
              </Pressable>
            ) : null}

            {preview ? (
              <View className="mt-4">
                <MacroChipRow
                  calories={preview.calories}
                  proteinG={preview.proteinG}
                  carbsG={preview.carbsG}
                  fatsG={preview.fatsG}
                  size="md"
                />
              </View>
            ) : null}
          </NutritionCard>

          {saveState === 'error' ? <SyncOfflineState state="error" label="No se pudo registrar" /> : null}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Volver a la búsqueda"
                tone="neutral"
                onPress={() => {
                  setSelected(null)
                  setSaveState('idle')
                }}
              >
                Volver
              </NutritionMotionButton>
            </View>
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Agregar al día"
                disabled={!validQuantity}
                pending={saving}
                onPress={() => void save()}
              >
                Agregar al día
              </NutritionMotionButton>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </View>
  )
}

/**
 * Fila de un alimento del catálogo (resultado o favorito): toca la fila para elegirlo, o la
 * estrella para marcarlo/desmarcarlo como favorito. La estrella es una Pressable anidada, así
 * que su toque no dispara el pick de la fila (responder RN al hijo más profundo).
 */
function CatalogPickRow({
  food,
  index,
  isFavorite,
  favBusy,
  onPick,
  onToggleFavorite,
}: {
  food: FoodCatalogItem
  index: number
  isFavorite: boolean
  favBusy: boolean
  onPick: (food: FoodCatalogItem) => void
  onToggleFavorite: (food: FoodCatalogItem) => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Agregar ${food.name}`}
      onPress={() => onPick(food)}
      className={index > 0 ? 'border-t border-border-subtle px-3' : 'px-3'}
    >
      <FoodRow
        food={{
          id: food.id,
          name: food.name,
          detail: food.brand,
          quantityLabel: `${food.servingSize} ${food.servingUnit}`,
          calories: food.calories,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatsG: food.fatsG,
          thumbnailUrl: foodMediaThumbnailUrl(food.media),
        }}
        fallbackEmoji={foodCategoryEmoji(food.category)}
        nameLines={2}
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? `Quitar ${food.name} de favoritos` : `Agregar ${food.name} a favoritos`}
            accessibilityState={{ selected: isFavorite, busy: favBusy }}
            disabled={favBusy}
            hitSlop={8}
            onPress={() => onToggleFavorite(food)}
            className="h-11 w-11 items-center justify-center"
          >
            <Star size={20} color={isFavorite ? '#FBBF24' : '#818C9A'} fill={isFavorite ? '#FBBF24' : 'transparent'} />
          </Pressable>
        }
      />
    </Pressable>
  )
}
