import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Pencil, Search, User, X } from 'lucide-react-native'
import { NutritionHeader, NutritionStatePanel, FoodThumbnail } from '../../../components/nutrition-v2'
// Import por ruta directa (no via el barrel): respeta el contrato de MacroChipRow.
import { MacroChipRow } from '../../../components/nutrition-v2/MacroChipRow'
import {
  FOOD_SEARCH_MIN_QUERY,
  isOffsetListMode,
  matchesFoodQuery,
  nextFoodFilterMode,
  resolveFoodCatalogMode,
  usesLocalTextFilter,
  type FoodCatalogCursor,
  type FoodCatalogItem,
  type FoodFilterMode,
} from '@eva/nutrition-v2'
import { useTheme } from '../../../context/ThemeContext'
import { listCoachFoodCatalogPage, searchFoodCatalogV2 } from '../../../lib/nutrition-v2-catalog.api'
import { foodMediaThumbnailUrl } from '../../../lib/nutrition-v2-food-media'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  getFoodSourceAttribution,
  getFoodVerificationLabel,
  type FoodVerificationTone,
} from '../../../lib/food-detail'
import { FoodDetailSheet } from '../../../components/coach/FoodDetailSheet'
import { COACH_TABBAR_CLEARANCE } from '../../../components/coach/CoachMobileChrome'

/**
 * Catálogo V2 del coach (RN, read-only) — port de
 * `apps/web/src/app/coach/nutrition-v2/_components/FoodCatalogBrowser.tsx:37-257`.
 *
 * Ficha al tocar una fila (sin segundo fetch). El gate lo aplica el servidor en cada lectura
 * (`/api/mobile/nutrition-v2/catalog` re-verifica flag + scope); la UI nunca autoriza.
 *
 * CINCO MODOS (T2.3 F6.2, paridad con el hub web). Cuál está activo lo decide
 * `resolveFoodCatalogMode` de `@eva/nutrition-v2` — la MISMA función pura que obedece la web, no
 * una copia de sus booleanos:
 *  - `browse`  sin filtro y sin texto: primera página del catálogo por nombre (offset).
 *  - `invite`  sin filtro y con 1 carácter: no alcanza para la RPC.
 *  - `search`  sin filtro y con 2+: `search_food_catalog_v2` por keyset cursor.
 *  - `mine`    chip "Solo míos": mis alimentos por offset, el texto filtra LOCAL.
 *  - `edited`  chip "Editados por mí": mis correcciones por offset, el texto filtra LOCAL.
 *
 * Dos data paths con paginación distinta conviviendo: keyset en `search`, offset en los otros
 * tres. Por eso el cursor y el offset viven en estados SEPARADOS y cada carga anota de qué modo
 * viene — mezclarlos fue el bug de cursores que la web ya pagó en F1.
 *
 * Doble uso: ruta standalone (deep-links, con su propio `SafeAreaView` + `NutritionHeader
 * onBack`) y cuerpo embebible bajo el tablist del hub (4B-17). Con `embedded`, el shell del
 * hub aporta safe-area y chrome, así que omitimos ambos y sumamos el clearance de la tab-bar
 * del coach al pie de la lista; el buscador+lista+ficha quedan intactos en ambos modos.
 *
 * QA-4 H2: el chrome del hub (título + tablist) colapsa con el scroll y solo las pestañas
 * quedan pegadas. Por eso el buscador vive DENTRO del scroll (`ListHeaderComponent`) en ambos
 * modos: si se quedara fuera, al colapsar el título aparecería un hueco entre las pestañas y
 * el buscador. El shell pasa `chromeHeight` (paddingTop del contenido, para que la lista
 * empiece bajo el chrome) y `onScroll` (mueve el chrome + minimiza la cápsula del coach).
 */

const MIN_QUERY = FOOD_SEARCH_MIN_QUERY
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
  neutral: { box: 'border-subtle bg-surface-sunken', text: 'text-muted' },
  danger: { box: 'border-danger-500/30 bg-danger-500/10', text: 'text-danger-700' },
}

/** Entero sin decimales; resto redondeado (envase). */
function fmt0(value: number): string {
  return String(Math.round(value))
}

export default function CoachNutritionCatalogScreen({
  embedded = false,
  chromeHeight = 0,
  onScroll,
}: {
  embedded?: boolean
  /** Alto del chrome colapsable del hub; solo aplica embebido. */
  chromeHeight?: number
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const router = useRouter()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [filterMode, setFilterMode] = useState<FoodFilterMode>('all')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<FoodCatalogItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const activeController = useRef<AbortController | null>(null)
  const latestQuery = useRef('')

  // El modo es DERIVADO: nunca se guarda en estado. Dentro de un filtro el texto no dispara
  // consulta, así que el término debounceado solo importa cuando no hay filtro.
  const mode = resolveFoodCatalogMode({ filterMode, query: debounced })

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
      setNextOffset(null)
      setHasMore(res.hasMore)
      setLoading(false)
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError(err instanceof Error ? err.message : 'No se pudo buscar en el catálogo.')
      setItems([])
      setCursor(null)
      setNextOffset(null)
      setHasMore(false)
      setLoading(false)
    }
  }, [])

  /** Primera página de los modos que paginan por offset (`browse`, `mine`, `edited`). */
  const runOffsetList = useCallback(async (listMode: 'browse' | 'mine' | 'edited') => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await listCoachFoodCatalogPage({
        mode: listMode,
        offset: 0,
        countryCode: 'CL',
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setItems(res.items)
      setCursor(null)
      setNextOffset(res.nextOffset)
      setHasMore(res.hasMore)
      setLoading(false)
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return
      setError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo.')
      setItems([])
      setCursor(null)
      setNextOffset(null)
      setHasMore(false)
      setLoading(false)
    }
  }, [])

  // Un solo efecto para los cinco modos: el que manda es `mode`, no el texto. `invite` es el
  // único que no consulta nada — limpia y espera, igual que la web.
  useEffect(() => {
    if (mode === 'invite') {
      activeController.current?.abort()
      latestQuery.current = debounced
      setItems([])
      setCursor(null)
      setNextOffset(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }
    if (mode === 'search') {
      void runSearch(debounced)
      return
    }
    if (isOffsetListMode(mode)) void runOffsetList(mode)
  }, [mode, debounced, runSearch, runOffsetList])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    // Keyset para `search`, offset para el resto. Cada rama exige SU token de paginación, así que
    // un modo nunca puede continuar la página del otro.
    if (mode === 'search') {
      if (!cursor) return
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
      } finally {
        setLoadingMore(false)
      }
      return
    }
    if (!isOffsetListMode(mode) || nextOffset == null) return
    const pageMode = mode
    setLoadingMore(true)
    try {
      const res = await listCoachFoodCatalogPage({
        mode: pageMode,
        offset: nextOffset,
        countryCode: 'CL',
      })
      // El coach pudo cambiar de chip mientras cargaba: la página vieja se descarta.
      if (pageMode !== resolveFoodCatalogMode({ filterMode, query: debounced })) return
      setItems((prev) => [...prev, ...res.items])
      setNextOffset(res.nextOffset)
      setHasMore(res.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }, [mode, cursor, nextOffset, loadingMore, debounced, filterMode])

  const openDetail = useCallback((item: FoodCatalogItem) => {
    setDetailItem(item)
    setDetailOpen(true)
  }, [])

  // Dentro de un filtro el texto NO consulta: recorta en cliente lo ya cargado (son decenas de
  // filas). `matchesFoodQuery` es el mismo predicado sin acentos que usa la web.
  const visible = usesLocalTextFilter(mode)
    ? items.filter((item) => matchesFoodQuery(item, debounced))
    : items

  const showInvite = mode === 'invite'
  // "No tienes ninguno" y "ninguno coincide con lo que escribiste" son estados distintos y se
  // cuentan distinto: el universo son `items`, el resultado del filtro local es `visible`.
  const showEmptyUniverse = !showInvite && !loading && !error && items.length === 0
  const showEmpty = !showInvite && !loading && !error && items.length > 0 && visible.length === 0
  const showList = !showInvite && !error && visible.length > 0

  function applyFilterMode(next: FoodFilterMode) {
    // Cambiar de chip cambia de data path: la lista y sus dos tokens de paginación se vacían para
    // que no quede una página del modo anterior colgando.
    activeController.current?.abort()
    setFilterMode(next)
    setItems([])
    setCursor(null)
    setNextOffset(null)
    setHasMore(false)
    setError(null)
  }

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
          title="Sigue escribiendo"
          description="La busqueda necesita al menos 2 caracteres. Borra el texto para volver a ver el catalogo completo."
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
    if (showEmptyUniverse) {
      if (mode === 'edited') {
        return (
          <NutritionStatePanel
            icon="empty"
            illustration="catalogo-vacio"
            title="Todavia no corregiste ningun alimento"
            description="Cuando corrijas los macros de un alimento del catalogo, aparecera aca con el icono ✎. Tus correcciones solo te afectan a ti y a tus planes nuevos."
          />
        )
      }
      if (mode === 'mine') {
        return (
          <NutritionStatePanel
            icon="empty"
            illustration="catalogo-vacio"
            title="Todavia no creaste ningun alimento"
            description="Los alimentos que crees aparecen aca: solo los ves tu, y quedan disponibles para todos tus planes."
          />
        )
      }
      return (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description="No encontramos alimentos para esa busqueda. Prueba con otro nombre o marca."
        />
      )
    }
    if (showEmpty) {
      return (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description={
            mode === 'edited'
              ? 'Ninguno de tus alimentos editados coincide con ese nombre o marca.'
              : 'Ninguno de tus alimentos coincide con ese nombre o marca.'
          }
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
            className={`min-h-11 flex-row items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-4 ${loadingMore ? 'opacity-60' : ''}`}
          >
            {loadingMore ? <ActivityIndicator color={theme.primary} size="small" /> : null}
            <Text className="text-sm font-semibold text-strong">
              {loadingMore ? 'Cargando…' : 'Cargar mas'}
            </Text>
          </Pressable>
        ) : null}
        {/* Pie ODbL (obligación de licencia) — copy verbatim de web, visible con ≥1 resultado. */}
        <Text className="px-1 pt-1 text-center text-[10.5px] leading-relaxed text-subtle">
          {OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION}{' '}
          <Text className="underline text-subtle" onPress={() => void Linking.openURL(OPEN_FOOD_FACTS_URL)}>
            Ver Open Food Facts
          </Text>
        </Text>
      </View>
    )
  }

  // Cabecera DENTRO del scroll (ver nota QA-4 H2 arriba): en standalone incluye el título con
  // flecha; embebido solo el buscador, porque el título lo pone el chrome del hub. El padding
  // horizontal lo aporta el `contentContainerStyle`, así que aquí no va `px-4`.
  const listHeader = (
    <View className={`gap-4 pb-2 ${embedded ? 'pt-1' : 'pt-4'}`}>
      {embedded ? null : <NutritionHeader title="Alimentos" onBack={() => router.back()} />}
      <View className="flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
        <Search color={theme.mutedForeground} size={16} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={
            mode === 'edited'
              ? 'Filtrar entre tus editados…'
              : mode === 'mine'
                ? 'Filtrar entre tus alimentos…'
                : 'Buscar alimento por nombre o marca…'
          }
          placeholderTextColor={theme.mutedForeground}
          accessibilityLabel={
            mode === 'edited'
              ? 'Filtrar entre los alimentos que editaste'
              : mode === 'mine'
                ? 'Filtrar entre los alimentos que creaste'
                : 'Buscar alimento en el catalogo'
          }
          autoCorrect={false}
          returnKeyType="search"
          className="min-h-11 flex-1 py-2 text-base text-strong"
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
      {/* Los dos chips son EXCLUYENTES: `nextFoodFilterMode` apaga el otro. Se comportan como un
          radio-group con deselección, no como dos checkboxes, y por eso `accessibilityState.selected`
          sobre un botón — el estado "ninguno" es legítimo. */}
      <View accessibilityRole="tablist" className="flex-row flex-wrap items-center gap-1.5">
        {(
          [
            { key: 'mine', label: 'Solo mios', Icon: User },
            { key: 'edited', label: 'Editados por mi', Icon: Pencil },
          ] as const
        ).map(({ key, label, Icon }) => {
          const active = filterMode === key
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => applyFilterMode(nextFoodFilterMode(filterMode, key))}
              className={`min-h-9 shrink-0 flex-row items-center gap-1.5 rounded-pill border px-3 ${
                active ? 'border-primary bg-primary/10' : 'border-default bg-surface-card'
              }`}
            >
              <Icon color={active ? theme.primary : theme.mutedForeground} size={14} />
              <Text
                numberOfLines={1}
                className={`text-xs font-semibold ${active ? 'text-primary' : 'text-muted'}`}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  const body = (
    <>
      <View className="flex-1">
        <FlashList
          data={showList ? visible : []}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: embedded ? chromeHeight : 0,
            paddingBottom: embedded ? insets.bottom + COACH_TABBAR_CLEARANCE : 40,
          }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          ListHeaderComponent={listHeader}
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
                className="flex-row items-center gap-3 rounded-control border border-default bg-surface-card px-3 py-2.5"
              >
                <FoodThumbnail
                  alt={item.name}
                  src={foodMediaThumbnailUrl(item.media)}
                  fallbackCategory={item.category}
                  size="md"
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Text className="shrink text-sm font-semibold text-strong" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View className={`shrink-0 rounded-pill border px-1.5 py-0.5 ${tone.box}`}>
                      <Text className={`text-[10px] font-bold ${tone.text}`}>
                        {verification.label}
                      </Text>
                    </View>
                    {/* ✎ = corregiste los macros de este alimento. Estricto contra `true`: en el
                        contrato el campo es opcional y ausente significa "el catálogo no aplicó
                        merge", NO "sin corrección". */}
                    {item.hasOverride === true ? (
                      <View
                        accessibilityLabel="Editado por ti"
                        className="shrink-0 flex-row items-center gap-1 rounded-pill border border-primary/30 bg-primary/10 px-1.5 py-0.5"
                      >
                        <Pencil color={theme.primary} size={10} />
                        <Text className="text-[10px] font-bold text-primary">Editado</Text>
                      </View>
                    ) : null}
                    {/* "Propio" = lo creaste tú (`coach_id`), no viene del catálogo abierto. */}
                    {item.coachId ? (
                      <View className="shrink-0 rounded-pill border border-subtle bg-surface-sunken px-1.5 py-0.5">
                        <Text className="text-[10px] font-bold text-muted">Propio</Text>
                      </View>
                    ) : null}
                  </View>
                  {metaLine ? (
                    <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
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
    </>
  )

  // Embebido bajo el tablist del hub: sin SafeAreaView propio (el shell lo aporta).
  if (embedded) return <View className="flex-1">{body}</View>

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
      {body}
    </SafeAreaView>
  )
}
