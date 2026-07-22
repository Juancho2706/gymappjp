import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Search, X } from 'lucide-react-native'
import { NutritionHeader, NutritionStatePanel, FoodThumbnail } from '../../../components/nutrition-v2'
// Import por ruta directa (no via el barrel): respeta el contrato de MacroChipRow.
import { MacroChipRow } from '../../../components/nutrition-v2/MacroChipRow'
import type { FoodCatalogCursor, FoodCatalogItem } from '@eva/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { searchFoodCatalogV2 } from '../../../lib/nutrition-v2-catalog.api'
import { foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  type FoodVerificationTone,
} from '../../../lib/food-detail'
import { FoodDetailSheet } from '../../../components/coach/FoodDetailSheet'

/**
 * Catálogo V2 del coach (RN, read-only) — port de
 * `apps/web/src/app/coach/nutrition-v2/_components/FoodCatalogBrowser.tsx:37-257`.
 *
 * Buscador debounced (400 ms, mínimo 2 caracteres) + lista paginada por cursor + ficha
 * al tocar una fila (sin segundo fetch). Es un buscador PURO: sin alta de alimento, sin
 * pills de categoría, sin scope ni orden (esas afordancias eran de la V1, que muere). El
 * gate lo aplica el servidor en cada búsqueda (`/api/mobile/nutrition-v2/catalog`
 * re-verifica flag + scope); la UI nunca autoriza.
 *
 * Pantalla propia (no tab): el cableado del tablist del hub (4B-05) lo resuelve el juez
 * al integrar; hoy es alcanzable por ruta directa.
 */

const MIN_QUERY = 2
const DEBOUNCE_MS = 400
// Web pagina de a 20 (`FoodCatalogBrowser`/`PAGE_SIZE`); el default RN del contrato es 25.
// Pasamos 20 explícito para que el ritmo de cursor sea idéntico (el endpoint respeta el
// pageSize enviado, clamp 1..50).
const PAGE_SIZE = 20

// Tonos del badge de verificación en tokens del DS RN (mismo criterio que el kit: los raw
// emerald/sky/rose del web caen a semánticos success/info/danger, white-label safe).
const VERIFICATION_TONE_CLASSES: Record<FoodVerificationTone, { box: string; text: string }> = {
  verified: { box: 'border-success-500/30 bg-success-500/10', text: 'text-success-700' },
  community: { box: 'border-info-500/30 bg-info-500/10', text: 'text-info-600' },
  neutral: { box: 'border-border-subtle bg-surface-sunken', text: 'text-text-muted' },
  danger: { box: 'border-danger-500/30 bg-danger-500/10', text: 'text-danger-700' },
}

/** Entero sin decimales; resto redondeado (envase). */
function fmt0(value: number): string {
  return String(Math.round(value))
}

export default function CoachNutritionCatalogScreen() {
  const router = useRouter()
  const { theme } = useTheme()

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<FoodCatalogItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const activeController = useRef<AbortController | null>(null)
  const latestQuery = useRef('')

  // Debounce del texto → término confirmado.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const runSearch = useCallback(async (q: string) => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    latestQuery.current = q
    setLoading(true)
    setError(null)
    try {
      const res = await searchFoodCatalogV2({
        query: q,
        countryCode: 'CL',
        surface: 'coach',
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setItems(res.items)
      setCursor(res.nextCursor)
      setHasMore(res.hasMore)
      setLoading(false)
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError(err instanceof Error ? err.message : 'No se pudo buscar en el catálogo.')
      setItems([])
      setCursor(null)
      setHasMore(false)
      setLoading(false)
    }
  }, [])

  // Bajo el umbral: limpia la lista y cancela cualquier búsqueda en vuelo (web:83-95).
  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      activeController.current?.abort()
      latestQuery.current = debounced
      setItems([])
      setCursor(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }
    void runSearch(debounced)
  }, [debounced, runSearch])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || debounced.length < MIN_QUERY) return
    const q = debounced
    setLoadingMore(true)
    try {
      const res = await searchFoodCatalogV2({
        query: q,
        countryCode: 'CL',
        surface: 'coach',
        pageSize: PAGE_SIZE,
        cursor,
      })
      // Descarta si el término cambió mientras cargaba (web:102).
      if (q !== latestQuery.current) return
      setItems((prev) => [...prev, ...res.items])
      setCursor(res.nextCursor)
      setHasMore(res.hasMore)
      setLoadingMore(false)
    } catch {
      setLoadingMore(false)
    }
  }, [cursor, loadingMore, debounced])

  const openDetail = useCallback((item: FoodCatalogItem) => {
    setDetailItem(item)
    setDetailOpen(true)
  }, [])

  const showInvite = debounced.length < MIN_QUERY
  const showEmpty = !showInvite && !loading && items.length === 0 && !error
  const showList = !showInvite && !error && items.length > 0

  const renderEmpty = () => {
    if (error) {
      return (
        <NutritionStatePanel
          icon="error"
          tone="danger"
          illustration="error-amable"
          title="No se pudo buscar"
          description={error}
        />
      )
    }
    if (showInvite) {
      return (
        <NutritionStatePanel
          icon="empty"
          illustration="catalogo-vacio"
          title="Busca en el catalogo"
          description="Escribe al menos 2 caracteres para encontrar alimentos por nombre o marca."
        />
      )
    }
    if (loading) {
      return (
        <View className="items-center py-12">
          <ActivityIndicator color={theme.primary} />
        </View>
      )
    }
    if (showEmpty) {
      return (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description="No encontramos alimentos para esa busqueda. Prueba con otro nombre o marca."
        />
      )
    }
    return null
  }

  const renderFooter = () => {
    if (!showList) return null
    return (
      <View className="gap-3 pt-3">
        {hasMore && !loading ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={loadingMore ? 'Cargando' : 'Cargar mas'}
            accessibilityState={{ disabled: loadingMore }}
            disabled={loadingMore}
            onPress={() => void loadMore()}
            className={`min-h-11 flex-row items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 ${loadingMore ? 'opacity-60' : ''}`}
          >
            {loadingMore ? <ActivityIndicator color={theme.primary} size="small" /> : null}
            <Text className="text-sm font-semibold text-text-strong">
              {loadingMore ? 'Cargando…' : 'Cargar mas'}
            </Text>
          </Pressable>
        ) : null}
        {/* Pie ODbL (obligación de licencia) — copy verbatim de web, visible con ≥1 resultado. */}
        <Text className="px-1 pt-1 text-center text-[10.5px] leading-relaxed text-text-subtle">
          {OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION}{' '}
          <Text className="underline text-text-subtle" onPress={() => void Linking.openURL(OPEN_FOOD_FACTS_URL)}>
            Ver Open Food Facts
          </Text>
        </Text>
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
      <View className="gap-4 px-4 pt-4">
        <NutritionHeader title="Alimentos" onBack={() => router.back()} />
        <View className="flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
          <Search color={theme.mutedForeground} size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar alimento por nombre o marca…"
            placeholderTextColor={theme.mutedForeground}
            accessibilityLabel="Buscar alimento en el catalogo"
            autoCorrect={false}
            returnKeyType="search"
            className="min-h-11 flex-1 py-2 text-base text-text-strong"
          />
          {loading ? (
            <ActivityIndicator color={theme.mutedForeground} size="small" />
          ) : query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpiar busqueda"
              hitSlop={8}
              onPress={() => setQuery('')}
              className="h-6 w-6 items-center justify-center rounded-full bg-surface-sunken"
            >
              <X color={theme.mutedForeground} size={13} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View className="mt-2 flex-1">
        <FlashList
          data={showList ? items : []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          renderItem={({ item }) => {
            const verification = getFoodVerificationLabel(item.verificationStatus)
            const source = getFoodSourceAttribution(item.source)
            const basisLabel = item.servingUnit === 'ml' ? 'por 100 ml' : 'por 100 g'
            const packageLabel =
              item.packageQuantity != null && item.packageUnit
                ? `${fmt0(item.packageQuantity)} ${item.packageUnit}`
                : null
            const metaLine = [item.brand, packageLabel, source.label].filter(Boolean).join(' · ')
            const tone = VERIFICATION_TONE_CLASSES[verification.tone]
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ver ficha de ${item.name}`}
                onPress={() => openDetail(item)}
                className="flex-row items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5"
              >
                <FoodThumbnail
                  alt={item.name}
                  src={foodMediaThumbnailUrl(item.media)}
                  fallbackCategory={item.category}
                  size="md"
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Text className="shrink text-sm font-semibold text-text-strong" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View className={`shrink-0 rounded-pill border px-1.5 py-0.5 ${tone.box}`}>
                      <Text className={`text-[10px] font-bold ${tone.text}`}>
                        {verification.label}
                      </Text>
                    </View>
                  </View>
                  {metaLine ? (
                    <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                      {metaLine}
                    </Text>
                  ) : null}
                  <View className="mt-1">
                    <MacroChipRow
                      calories={item.calories}
                      proteinG={item.proteinG}
                      carbsG={item.carbsG}
                      fatsG={item.fatsG}
                      per={basisLabel}
                      size="sm"
                    />
                  </View>
                </View>
              </Pressable>
            )
          }}
        />
      </View>

      <FoodDetailSheet open={detailOpen} onClose={() => setDetailOpen(false)} item={detailItem} />
    </SafeAreaView>
  )
}
