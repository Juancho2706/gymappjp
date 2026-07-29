import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { AlertTriangle, ChevronLeft, Search, Star } from 'lucide-react-native'
import {
  FoodThumbnail,
  MacroChipRow,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionStatePanel,
  CelebrationOverlay,
  type CelebrationInstance,
} from '../../../../components/nutrition-v2'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../../components/alumno/AlumnoMobileChrome'
import { NutritionDomainOff } from '../../../../components/alumno/nutrition'
import { useAlumnoScrollHandler } from '../../../../lib/alumno-chrome-scroll'
import {
  CATALOG_MACROS_BASIS,
  NutritionTodayReadModelSchema,
  convertIntakeQuantity,
  defaultCatalogUnit,
  intakeUnitLabel,
  normalizeIntakeUnit,
  scaleSnapshotMacros,
  sortFoodsByFavoriteFirst,
  type FoodCatalogItem,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements } from '../../../../lib/entitlements'
import { supabase } from '../../../../lib/supabase'
import { searchFoodCatalogV2 } from '../../../../lib/nutrition-v2-catalog.api'
import { getNutritionTodayV2 } from '../../../../lib/nutrition-v2.api'
import { readNutritionV2Cache } from '../../../../lib/nutrition-v2-cache'
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
import { buildRecordIntakeMutation } from '../../../../lib/nutrition-v2-intake'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitRecordIntake,
} from '../../../../lib/nutrition-v2-intake-runner'
import {
  dupPortionInfo,
  mealSlotOptions,
  portionsCountLabelEs,
  resolveCatalogSearchState,
  unitOptionsFor,
} from '../../../../lib/nutrition-v2-add-food.logic'
import { useLocalDay } from '../../../../lib/nutrition-v2-date'
import { PORTIONS_COPY } from '../../../../lib/nutrition-portions-copy'
import { humanizeStudentWriteError } from '../../../../lib/student-access-copy'
import { decideMealLoggedCelebration, type CelebrationDecision } from '../../../../lib/nutrition-v2-celebrations'
import { claimMealLoggedCelebration } from '../../../../lib/nutrition-v2-celebrations.storage'
import { useTheme } from '../../../../context/ThemeContext'

// Live-search RN: decisión del owner #3 (DECISIONES-OWNER.md) — el debounce se
// queda; la web tendrá su propia tarea para subir live-search al buscador.
const SEARCH_DEBOUNCE_MS = 300

/** El abort del debounce (o del unmount) NO es un fallo del catálogo. */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) return error.name === 'AbortError'
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

export default function NutritionV2AddFoodScreen() {
  const router = useRouter()
  // 4A-01: pantalla bajo (tabs) con la cápsula visible — el scroll reserva el
  // clearance de la cápsula y alimenta su minimizado (patrón de las demás tabs).
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const { theme } = useTheme()
  const entitlements = useEntitlements()
  const params = useLocalSearchParams<{ slot?: string; slotName?: string }>()
  const slotCode = typeof params.slot === 'string' && params.slot ? params.slot : null
  const slotName = typeof params.slotName === 'string' && params.slotName ? params.slotName : null

  const [userId, setUserId] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  // NUT-020: el fallo del live-search tiene estado PROPIO. Antes el `.catch` solo vaciaba los
  // resultados y el alumno veía "Sin resultados en el catálogo local" con la red caída.
  const [searchError, setSearchError] = useState(false)
  // Fuerza el refetch del término ACTUAL sin obligar al alumno a retocar el texto (el efecto
  // depende de `term`, así que re-escribir lo mismo no dispara nada).
  const [retryTick, setRetryTick] = useState(0)
  const [selected, setSelected] = useState<FoodCatalogItem | null>(null)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteFoods, setFavoriteFoods] = useState<FoodCatalogItem[]>([])
  const [favBusyId, setFavBusyId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState('100')
  const [unit, setUnit] = useState('g')
  // Franja elegida: '' = "Sin franja" (mismo modelo que la web,
  // TodayExperience.tsx:673,791). Preselección por param (initialMealSlot, :649,330).
  const [mealSlot, setMealSlot] = useState<string>(slotCode ?? '')
  // Read-model del día: franjas para el selector + estado de porciones del
  // dup-warning (la web lo recibe del Hoy que hospeda el diálogo; la pantalla
  // pusheada RN lo carga cache-first, misma fuente `today`).
  const [todayModel, setTodayModel] = useState<NutritionTodayReadModel | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<CelebrationInstance | null>(null)
  const celebrationNonce = useRef(0)
  const fireCelebration = useCallback((decision: CelebrationDecision) => {
    celebrationNonce.current += 1
    setCelebration({ ...decision, nonce: celebrationNonce.current })
  }, [])

  // Día local VIVO (NUT-018): antes se congelaba al montar y un registro a las 00:30 se
  // persistía con la fecha de ayer. El timer interno cubre la app despierta; `recheckDate` cubre
  // lo que el timer NO puede ver — el proceso suspendido en background y el regreso a esta
  // pantalla desde otra (el alumno pudo dejarla abierta y cruzar la medianoche).
  const [date, recheckDate] = useLocalDay()
  const rolloutEnabled = entitlements.ready && isEnabled('nutritionV2Student')

  // Revalidar el día al recuperar el foco y al volver del background: si cambió, el efecto del
  // read-model se reencadena solo con la fecha nueva y el registro se persiste en el día correcto.
  useFocusEffect(
    useCallback(() => {
      recheckDate()
    }, [recheckDate]),
  )

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheckDate()
    })
    return () => subscription.remove()
  }, [recheckDate])

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

  // Read-model del día (cache-first + fetch): franjas del selector
  // (mealSlotOptions, web nutrition-today.logic.ts:50-52) y `exchangeTargets`/
  // `exchangeFoods` del aviso anti-duplicado (web TodayExperience.tsx:769-772).
  // Si falla y no hay cache, el selector muestra solo "Sin franja" y el aviso no
  // aplica (misma degradación que un día sin franjas en la web).
  useEffect(() => {
    if (!userId) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      const cached = await readNutritionV2Cache({
        userId,
        clientId: userId,
        kind: 'today',
        scopeKey: date,
        schema: NutritionTodayReadModelSchema,
        allowStale: true,
      })
      if (active && cached) setTodayModel(cached.payload)
      try {
        const fresh = await getNutritionTodayV2({ date, signal: controller.signal })
        if (active) setTodayModel(fresh)
      } catch {
        // Cache (o nada): degradación descrita arriba.
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [date, userId])

  useEffect(() => {
    if (selected) return
    const normalized = term.trim()
    if (normalized.length < 2) {
      setResults([])
      setSearching(false)
      // El error no puede quedar pegado al borrar el término (volvemos al hint).
      setSearchError(false)
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError(false)
    const timer = setTimeout(() => {
      searchControllerRef.current?.abort()
      const controller = new AbortController()
      searchControllerRef.current = controller
      searchFoodCatalogV2({ query: normalized, surface: 'student', signal: controller.signal })
        .then((page) => {
          if (!cancelled && mountedRef.current) setResults(page.items)
        })
        .catch((error: unknown) => {
          if (cancelled || !mountedRef.current) return
          // El aborto lo provoca el PROPIO debounce al tipear rápido: no es un fallo del
          // catálogo y marcarlo como error haría parpadear "No pudimos consultar" en cada tecla.
          if (isAbortError(error)) return
          setResults([])
          setSearchError(true)
        })
        .finally(() => {
          if (!cancelled && mountedRef.current) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [retryTick, selected, term])

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
    setSaveError(null)
    // Defaults web (TodayExperience.tsx:752-756): cantidad = porción del
    // catálogo, unidad = servingUnit del alimento.
    setQuantity(String(food.servingSize))
    // Unidad CANÓNICA (g|ml|un), no el texto libre del catálogo (NUT-017).
    setUnit(defaultCatalogUnit(food.servingUnit))
  }, [])

  // Toggle optimista con rollback: la estrella cambia al instante; si el server falla, revierte
  // el id y la lista de favoritos Y AVISA (web: toast.error, TodayExperience.tsx:709-721).
  // Reusa `toggleClientFoodFavorite` (allergy/intolerance-safe).
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
        // Copys 1:1 de la action web (favorites.actions.ts:88,98,113); Alert =
        // adaptación nativa del toast (sin sistema de toasts en RN).
        Alert.alert(
          res.blocked
            ? 'Tu coach marcó este alimento; no puedes cambiarlo.'
            : wasFav
              ? 'No se pudo quitar el favorito.'
              : 'No se pudo guardar el favorito.',
        )
      }
    })
  }, [favoriteIds, userId])

  // Favoritos PRIMERO en los resultados (reordena en cliente, sin tocar la búsqueda).
  const orderedResults = useMemo(() => sortFoodsByFavoriteFirst(results, favoriteIds), [results, favoriteIds])
  const showFavoritesShortcut = term.trim().length < 2 && favoriteFoods.length > 0
  // Decisión de estado del buscador en un helper PURO (testeable sin render RN) — NUT-020.
  const searchState = resolveCatalogSearchState({
    termLength: term.trim().length,
    searching,
    error: searchError,
    resultCount: results.length,
  })

  // Franjas del selector (web slotOptions ← mealSlotOptions(today), TodayExperience.tsx:328).
  const slotOptions = useMemo(() => (todayModel ? mealSlotOptions(todayModel) : []), [todayModel])

  const parsedQuantity = Number(quantity.replace(',', '.'))
  const validQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
  // canSubmit web (TodayExperience.tsx:764-765): cantidad válida + unidad no vacía.
  const canSubmit = selected !== null && validQuantity && unit.trim().length > 0

  /**
   * Cambio de unidad: CONVIERTE la cantidad (NUT-017). 100 g de un alimento con porción 60 g
   * pasan a 1,7 un; si la conversión no es representable se limpia el campo en vez de arrastrar
   * un número que ya no significa lo mismo. Espejo del `changeUnit` web.
   */
  const changeUnit = useCallback((nextUnit: string) => {
    void Haptics.selectionAsync()
    setUnit((currentUnit) => {
      const from = normalizeIntakeUnit(currentUnit)
      const to = normalizeIntakeUnit(nextUnit)
      if (selected && from && to && from !== to) {
        const converted = convertIntakeQuantity({
          quantity: Number(quantity.replace(',', '.')),
          from,
          to,
          servingSize: selected.servingSize,
        })
        setQuantity(converted === null ? '' : String(converted))
      }
      return nextUnit
    })
  }, [quantity, selected])

  /**
   * Total ESTIMADO con la MISMA función pura que usa el servidor: el x100 de un cambio de unidad
   * mal hecho se ve ANTES de registrar. RN había retirado el preview por paridad con la web; ahora
   * la web también lo muestra, así que vuelve por paridad (y por seguridad del dato).
   */
  const estimatedTotals = useMemo(() => {
    if (!selected || !validQuantity) return null
    return scaleSnapshotMacros(selected, {
      quantity: parsedQuantity,
      unit: normalizeIntakeUnit(unit) ?? unit,
      servingSize: selected.servingSize,
      basis: CATALOG_MACROS_BASIS,
    })
  }, [parsedQuantity, selected, unit, validQuantity])

  // Aviso anti-duplicado (no bloqueante, web TodayExperience.tsx:769-772,866-873):
  // el alimento elegido pertenece a un grupo con porciones YA marcadas en la
  // franja seleccionada ⇒ caja ámbar inline, sin frenar el registro.
  const dupWarningMessage = useMemo(() => {
    if (!selected || !todayModel) return null
    const info = dupPortionInfo({
      foodId: selected.id,
      mealSlotCode: mealSlot === '' ? null : mealSlot,
      today: todayModel,
    })
    if (!info) return null
    return PORTIONS_COPY.student.dupWarning(portionsCountLabelEs(info.marcadas), info.groupName)
  }, [mealSlot, selected, todayModel])

  const save = useCallback(async () => {
    if (!userId || !deviceId || !selected || saving || !canSubmit) return
    setSaving(true)
    setSaveError(null)
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
        unit: normalizeIntakeUnit(unit) ?? unit.trim(),
        mealSlot: mealSlot === '' ? null : mealSlot,
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
          // Base declarada: los macros del catálogo son por 100 g/ml (NUT-001).
          macrosBasis: CATALOG_MACROS_BASIS,
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
        // Celebración meal-logged: divergencia RN APROBADA por el owner
        // (DECISIONES-OWNER.md #2 — valor nativo, no se replica a web).
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
      // Error humanizado DENTRO de la superficie sin perder el formulario
      // (web DialogError, TodayExperience.tsx:427-439,801).
      setSaveError(humanizeStudentWriteError(outcome.error.message, 'No se pudo registrar. Intenta nuevamente.'))
    } catch (error) {
      if (mountedRef.current) {
        setSaveError(
          humanizeStudentWriteError(
            error instanceof Error ? error.message : null,
            'No se pudo registrar. Intenta nuevamente.',
          ),
        )
      }
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }, [canSubmit, date, deviceId, fireCelebration, mealSlot, parsedQuantity, router, saving, selected, unit, userId])

  if (!entitlements.ready) {
    return <View className="flex-1 bg-surface-app" />
  }

  if (!entitlements.nutritionEnabled) {
    return (
      <View
        className="flex-1 bg-surface-app px-4"
        style={{ paddingTop: insets.top + 24 }}
      >
        <NutritionDomainOff />
      </View>
    )
  }

  if (!rolloutEnabled) {
    return (
      <View
        className="flex-1 bg-surface-app px-4"
        style={{ paddingTop: insets.top + 24 }}
      >
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
    {/* El teclado tapaba "Cantidad" y los chips de unidad/franja: `decimal-pad` no trae
        tecla de retorno en iOS, así que sin esto no había forma de bajarlo ni de ver lo
        que queda debajo. `padding` solo en iOS (Android ya redimensiona la ventana) —
        misma convención que el builder y el quick-edit del coach. */}
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4"
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE,
      }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      keyboardDismissMode="on-drag"
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
                placeholder="Ej: pechuga de pollo"
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

          {searchState === 'hint' ? (
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
              // Copys web exactos: descripción del diálogo (TodayExperience.tsx:777)
              // + hint de mínimo 2 caracteres (:736). El panel como estado (y no un
              // error post-submit) es parte de la adaptación live-search aprobada.
              <NutritionStatePanel
                icon="info"
                title="Busca en el catálogo local y elige cuánto comiste."
                description="Escribe al menos 2 caracteres."
              />
            )
          ) : searchState === 'searching' ? (
            // Estado propio del live-search (la web muestra pending en el botón
            // "Buscar"): adaptación escrita de la decisión del owner #3.
            <NutritionStatePanel icon="info" title="Buscando…" description="Consultando el catálogo de EVA." />
          ) : searchState === 'error' ? (
            // NUT-020: el fallo del catálogo NO puede parecer "sin resultados". Tono warning
            // (mismo del aviso del scanner) + reintento explícito del término actual.
            <NutritionStatePanel
              icon="info"
              tone="warning"
              title="No pudimos consultar el catálogo"
              description="Revisa tu conexión e intenta de nuevo."
              action={
                <NutritionMotionButton
                  accessibilityLabel="Reintentar búsqueda en el catálogo"
                  tone="neutral"
                  onPress={() => setRetryTick((tick) => tick + 1)}
                >
                  Reintentar
                </NutritionMotionButton>
              }
            />
          ) : searchState === 'empty' ? (
            // Título 1:1 web (TodayExperience.tsx:748); la descripción es requerida
            // por el kit RN y se conserva como guía nativa documentada.
            <NutritionStatePanel
              icon="empty"
              title="Sin resultados en el catálogo local."
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
          <NutritionCard>
            {/* Panel del alimento elegido — espejo web TodayExperience.tsx:802-825:
                card sunken neutra con thumb + nombre + "{marca} · {categoría} | Sin
                marca" + macros base "por {servingSize} {servingUnit}" (sin preview
                de totales: ese extra RN se retiró por paridad). */}
            <View className="flex-row items-start gap-3 rounded-card border border-border-subtle bg-surface-sunken p-3">
              <FoodThumbnail
                alt={selected.name}
                src={foodMediaThumbnailUrl(selected.media)}
                fallbackEmoji={foodCategoryEmoji(selected.category)}
              />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-text-strong" numberOfLines={1}>
                  {selected.name}
                </Text>
                <Text className="mt-0.5 text-xs text-text-muted" numberOfLines={1}>
                  {[selected.brand, selected.category].filter(Boolean).join(' · ') || 'Sin marca'}
                </Text>
                <View className="mt-1.5">
                  <MacroChipRow
                    calories={selected.calories}
                    proteinG={selected.proteinG}
                    carbsG={selected.carbsG}
                    fatsG={selected.fatsG}
                    per={`por ${selected.servingSize} ${selected.servingUnit}`}
                    size="sm"
                  />
                </View>
                {foodOdblAttributionLine(selected.source) ? (
                  <Text className="mt-1 text-[10px] text-text-subtle">{foodOdblAttributionLine(selected.source)}</Text>
                ) : null}
              </View>
            </View>

            {/* Cantidad + Unidad con labels web (TodayExperience.tsx:828,837). Las
                unidades son las web (:758-761); chips segmentadas = picker nativo
                del repo (mismo patrón del editor de registros). */}
            <View className="mt-4">
              <Text className="mb-1 text-xs font-semibold text-text-muted">Cantidad</Text>
              <TextInput
                accessibilityLabel="Cantidad"
                className="min-h-12 w-28 rounded-control border border-border-default bg-surface-app px-3 text-lg text-text-strong"
                inputMode="decimal"
                keyboardType="decimal-pad"
                onChangeText={setQuantity}
                selectTextOnFocus
                value={quantity}
              />
            </View>
            <View className="mt-3">
              <Text className="mb-1 text-xs font-semibold text-text-muted">Unidad</Text>
              <View className="flex-row flex-wrap gap-2">
                {unitOptionsFor(selected).map((value) => (
                  <SelectChip
                    key={value}
                    accessibilityLabel={`Unidad ${intakeUnitLabel(value)}`}
                    active={unit === value}
                    label={intakeUnitLabel(value)}
                    onPress={() => changeUnit(value)}
                  />
                ))}
              </View>
            </View>

            {/* Total ESTIMADO (NUT-017): misma función pura que el servidor, así un cambio de
                unidad mal hecho se ve ANTES de registrar. Paridad con el web. */}
            {estimatedTotals ? (
              <View
                accessibilityLiveRegion="polite"
                className="mt-3 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2"
              >
                <Text className="text-xs font-semibold text-text-muted">Total estimado</Text>
                <View className="mt-1">
                  <MacroChipRow
                    calories={estimatedTotals.calories}
                    proteinG={estimatedTotals.proteinG}
                    carbsG={estimatedTotals.carbsG}
                    fatsG={estimatedTotals.fatsG}
                    per={`por ${quantity} ${intakeUnitLabel(normalizeIntakeUnit(unit) ?? 'g')}`}
                    size="sm"
                  />
                </View>
              </View>
            ) : null}

            {/* Selector de franja — web "Franja (opcional)" con "Sin franja" + TODAS
                las franjas del día (TodayExperience.tsx:851-865), preseleccionada por
                param (initialMealSlot, :649,330,414). */}
            <View className="mt-3">
              <Text className="mb-1 text-xs font-semibold text-text-muted">Franja (opcional)</Text>
              <View className="flex-row flex-wrap gap-2">
                <SelectChip
                  accessibilityLabel="Sin franja"
                  active={mealSlot === ''}
                  label="Sin franja"
                  onPress={() => setMealSlot('')}
                />
                {slotOptions.map((option) => (
                  <SelectChip
                    key={option.code}
                    accessibilityLabel={`Franja ${option.label}`}
                    active={mealSlot === option.code}
                    label={option.label}
                    onPress={() => setMealSlot(option.code)}
                  />
                ))}
              </View>
            </View>

            {/* Aviso anti-duplicado de porciones (web TodayExperience.tsx:866-873):
                caja ámbar aria-live=polite, NO bloquea el registro. Los amber-* web
                (canvas fijo) se mapean a la rampa warning del contrato white-label. */}
            {dupWarningMessage ? (
              <View
                accessibilityLiveRegion="polite"
                className="mt-3 rounded-control border border-warning-500/40 bg-warning-500/10 px-3 py-2"
              >
                <Text className="text-xs text-warning-700">{dupWarningMessage}</Text>
              </View>
            ) : null}
          </NutritionCard>

          {/* Error de guardado humanizado sin perder el formulario (web DialogError,
              TodayExperience.tsx:427-439). rose-* web → rampa danger del contrato. */}
          {saveError ? (
            <View
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              className="flex-row items-start gap-2 rounded-card border border-danger-500/40 bg-danger-500/10 p-3"
            >
              <AlertTriangle color={theme.destructive} size={16} />
              <Text className="min-w-0 flex-1 text-sm text-danger-700">{saveError}</Text>
            </View>
          ) : null}

          {/* Botones pie web (TodayExperience.tsx:781-798): [Cambiar alimento
              neutral] [Registrar primary]. */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Cambiar alimento"
                tone="neutral"
                onPress={() => {
                  setSelected(null)
                  setSaveError(null)
                }}
              >
                Cambiar alimento
              </NutritionMotionButton>
            </View>
            <View className="flex-1">
              <NutritionMotionButton
                accessibilityLabel="Registrar"
                disabled={!canSubmit}
                pending={saving}
                onPress={() => void save()}
              >
                Registrar
              </NutritionMotionButton>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </View>
  )
}

/**
 * Chip single-select (unidad / franja): adaptación nativa del `<select>` web con
 * el patrón segmentado del repo (mismas clases que el editor de registros del Hoy).
 */
function SelectChip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string
  active: boolean
  onPress: () => void
  accessibilityLabel: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      className={`min-h-11 items-center justify-center rounded-control border px-3 ${active ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-app'}`}
    >
      <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>{label}</Text>
    </Pressable>
  )
}

/**
 * Fila de un alimento del catálogo (resultado o favorito) — espejo del
 * `CatalogPickRow` web (TodayExperience.tsx:488-529): miniatura (foto o icono de
 * categoría), nombre, meta "{marca} · {categoría}" y macros base "/ 100 g|ml"
 * (el catálogo es por 100 g/ml). Toca la fila para elegirlo, o la estrella para
 * marcarlo/desmarcarlo como favorito (Pressable anidada: su toque no dispara el
 * pick de la fila — responder RN al hijo más profundo).
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
  const meta = [food.brand, food.category].filter(Boolean).join(' · ')
  return (
    <View className={`flex-row items-center gap-2 px-3 ${index > 0 ? 'border-t border-border-subtle' : ''}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Agregar ${food.name}`}
        onPress={() => onPick(food)}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3"
      >
        <FoodThumbnail
          alt={food.name}
          src={foodMediaThumbnailUrl(food.media)}
          fallbackEmoji={foodCategoryEmoji(food.category)}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-text-strong" numberOfLines={1}>
            {food.name}
          </Text>
          {meta ? (
            <Text className="text-xs text-text-muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <View className="mt-1">
            <MacroChipRow
              calories={food.calories}
              proteinG={food.proteinG}
              carbsG={food.carbsG}
              fatsG={food.fatsG}
              per={`/ 100 ${food.servingUnit === 'ml' ? 'ml' : 'g'}`}
              size="sm"
            />
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? `Quitar ${food.name} de favoritos` : `Agregar ${food.name} a favoritos`}
        accessibilityState={{ selected: isFavorite, busy: favBusy }}
        disabled={favBusy}
        hitSlop={8}
        onPress={() => onToggleFavorite(food)}
        className="h-11 w-11 items-center justify-center"
      >
        {/* amber-400 web (fill-amber-400 text-amber-400, canvas fijo TodayExperience.tsx:476,902) */}
        <Star size={20} color={isFavorite ? '#FBBF24' : '#818C9A'} fill={isFavorite ? '#FBBF24' : 'transparent'} />
      </Pressable>
    </View>
  )
}
