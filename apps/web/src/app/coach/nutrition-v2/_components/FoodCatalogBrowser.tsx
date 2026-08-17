'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { BadgeCheck, Loader2, Pencil, Plus, Scale, Search, User, X } from 'lucide-react'
import { MacroChipRow, NutritionStatePanel } from '@/components/nutrition-v2'
import { FoodDetailSheet } from '@/components/coach/FoodDetailSheet'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  type FoodDetailData,
  type FoodVerificationTone,
} from '@/lib/food-detail'
import type { FoodCatalogItem, FoodCatalogCursor } from '@eva/nutrition-v2'
// T2.3 F5 — el alta se mudó al hub junto con `/coach/foods`; el contrato server (`saveCustomFood`,
// que sigue viviendo en V1) no cambió. El gate `check:nutrition-v2-boundaries` es una lista negra
// de shells V1 (NutritionShell, NutritionHub, PlanBuilder, `/nutrition/_components/`, flags), no
// una prohibición de importar dominio V1.
import { AddFoodSheet } from './AddFoodSheet'
import type { FoodEquivalenceGroupOption } from './FoodEquivalenceFields'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { loadExchangeGroupsForCoachAction } from '../_actions/portions-groups.actions'
import { ClassifyFoodFlow, type ClassifiedFoodSummary } from './ClassifyFoodFlow'
import {
  foodCatalogItemToCardModel,
  foodCatalogItemToDetail,
  type FoodCatalogCardModel,
} from '../_lib/food-catalog-card'
import {
  FOOD_FILTER_PARAM,
  FOOD_SEARCH_MIN_QUERY,
  foodFilterModeFromParam,
  foodFilterModeToParam,
  isOffsetListMode,
  matchesFoodQuery,
  nextFoodFilterMode,
  resolveFoodCatalogMode,
  usesLocalTextFilter,
  type FoodFilterMode,
} from '@eva/nutrition-v2'
import {
  browseFoodCatalogHubAction,
  listCoachEditedFoodsHubAction,
  searchFoodCatalogHubAction,
} from '../_actions/food-catalog.actions'

const MIN_QUERY = FOOD_SEARCH_MIN_QUERY
const DEBOUNCE_MS = 400

const VERIFICATION_TONE_CLASSES: Record<FoodVerificationTone, string> = {
  verified:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  community:
    'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
  neutral: 'border-border-subtle bg-surface-sunken text-muted',
  danger:
    'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
}

const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

/**
 * Navegador del catalogo del tab Alimentos. Cuatro modos de lectura EXCLUYENTES, decididos por la
 * maquina pura de `@eva/nutrition-v2` (`resolveFoodCatalogMode`; vivio en `_lib` hasta F6.0, se
 * mudo al paquete para que el tab RN obedezca la MISMA maquina):
 *
 *  - `browse` (default, T2.3 F4.5): primera pagina del catalogo por nombre, OFFSET. Es lo que ve
 *    el coach al entrar al tab, SIN escribir nada — la funcion que traia `FoodBrowser` de
 *    `/coach/foods`, borrado en F5.
 *  - `search`: `search_food_catalog_v2` por nombre/marca, minimo 2 caracteres, keyset cursor.
 *  - `mine` ("Solo mios", F4.5): mis alimentos (`coach_id = actor`), OFFSET con pagina grande, y
 *    el texto filtra EN CLIENTE.
 *  - `edited` ("Editados por mi", F1): la pagina de `coach_food_overrides`, OFFSET, texto local.
 *
 * En los modos locales no hay minimo de caracteres porque no hay consulta que gastar; en `search`
 * el minimo lo impone la RPC y por debajo se muestra el panel de invitacion (`invite`) en vez de
 * volver al catalogo — un listado completo bajo un termino a medio escribir se lee como "esto es
 * lo que encontre", que es falso.
 *
 * Los cursores keyset y offset son incompatibles, asi que cambiar de modo aborta lo que este en
 * vuelo y vacia items/cursor/offset. El guard de respuestas viejas es el propio `AbortController`
 * compartido: una respuesta cuyo controller ya fue abortado se descarta, venga del modo que
 * venga (comparar solo el texto de la busqueda dejaba pasar la respuesta del otro modo).
 *
 * Los dos chips son EXCLUYENTES entre si (`nextFoodFilterMode`): tocar el inactivo apaga el otro,
 * tocar el activo vuelve al catalogo. El texto escrito NO se limpia al cambiar de chip — pasa a
 * filtrar el universo nuevo, que es lo que el coach espera cuando acota "pollo" a "solo mios".
 */
export function FoodCatalogBrowser({
  coachId,
  countryCode = 'CL',
}: {
  /**
   * Actor. Viaja como prop porque el alta lo necesita para `saveCustomFood.bind(...)`; no
   * autoriza nada: la action re-verifica `user.id === coachId` contra la sesión.
   */
  coachId: string
  countryCode?: string
}) {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  // Solo el valor INICIAL viene de la URL (deep-link); despues manda el estado local.
  const [filterMode, setFilterMode] = useState<FoodFilterMode>(() =>
    foodFilterModeFromParam(searchParams.get(FOOD_FILTER_PARAM)),
  )
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<FoodDetailData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  /** El item crudo del que salio la ficha: la clasificacion necesita macros, base y dueño. */
  const [detailItem, setDetailItem] = useState<FoodCatalogItem | null>(null)
  const [classifyOpen, setClassifyOpen] = useState(false)
  /**
   * Catalogo COMPLETO de grupos (no solo id/code/name): el formulario de clasificacion calcula
   * la sugerencia de gramos con las macros de referencia del grupo, en cliente y sin round-trip.
   */
  const [exchangeGroups, setExchangeGroups] = useState<ExchangeGroup[]>([])
  const [exchangeGroupsLoading, setExchangeGroupsLoading] = useState(false)
  /**
   * Lo clasificado EN ESTA SESION, por alimento. No es cache de lectura: es la unica forma de
   * que la card refleje el cambio sin recarga dura, porque el read model del catalogo
   * (`FoodCatalogItem`) no emite grupo ni gramos — re-disparar la busqueda traeria exactamente
   * los mismos datos y ademas tiraria las paginas que el coach ya cargo con "Cargar mas".
   */
  const [classifiedNow, setClassifiedNow] = useState<Record<string, ClassifiedFoodSummary>>({})
  /**
   * Fuerza la relectura aunque ni el texto ni el modo cambien. Hace falta en el caso MAS comun
   * del alta: el coach busca "pollo grillado", no lo encuentra, lo crea — y el termino ya era
   * ese, asi que reescribirlo no dispararia ninguna consulta y el alimento nuevo no aparecería.
   * Lo miran los DOS efectos de carga, porque el alta tambien puede terminar en "Solo mios".
   */
  const [searchNonce, setSearchNonce] = useState(0)

  const activeController = useRef<AbortController | null>(null)
  const exchangeGroupsRequested = useRef(false)

  /**
   * Corta lo que este en vuelo y abre una nueva "generacion" de resultados. Baja `loadingMore`
   * porque una respuesta descartada nunca vuelve a bajarlo, y el boton quedaba deshabilitado
   * para siempre. Quien pagina lo vuelve a subir en la misma tanda de estado.
   */
  const beginRequest = useCallback(() => {
    activeController.current?.abort()
    const controller = new AbortController()
    activeController.current = controller
    setLoadingMore(false)
    return controller
  }, [])

  const clearResults = useCallback(() => {
    setItems([])
    setCursor(null)
    setNextOffset(null)
    setHasMore(false)
    setError(null)
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  /**
   * Espeja el filtro en la URL sin navegar ni tocar el historial (patron de `?tab=`), y por la
   * MISMA razon: `router.replace` refetchearia el RSC de la pagina (roster + picker) por tocar un
   * chip. El param se omite en su default (`all`), como hacen el tab y los filtros del roster.
   */
  const applyFilterMode = useCallback((next: FoodFilterMode) => {
    setFilterMode(next)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const value = foodFilterModeToParam(next)
    if (value) params.set(FOOD_FILTER_PARAM, value)
    else params.delete(FOOD_FILTER_PARAM)
    const qs = params.toString()
    const path = window.location.pathname
    window.history.replaceState(window.history.state, '', qs ? `${path}?${qs}` : path)
  }, [])

  /**
   * QUE se esta mostrando. Derivado, nunca guardado: dos fuentes de verdad para el modo es
   * exactamente como se mezclan un cursor keyset y un offset. Usa el texto DEBOUNCEADO a
   * proposito — con el texto crudo, escribir "pollo" rapido haria parpadear el panel de
   * invitacion en la primera letra.
   */
  const mode = useMemo(
    () => resolveFoodCatalogMode({ filterMode, query: debounced }),
    [filterMode, debounced],
  )

  /**
   * Grupos de porciones del bloque opcional "Equivalencia" del alta, cargados la PRIMERA vez
   * que se abre el sheet y cacheados en estado.
   *
   * No se resuelven en el server component del hub a proposito: el tab se cambia con
   * `history.replaceState`, sin refetch del RSC, asi que ese dato solo llegaria en deep-links
   * y ademas se pagaria en las otras tres pestañas, que no lo usan (el hub ya sufrio flood de
   * queries en O1). Si la carga falla se libera el candado: el bloque de equivalencia es
   * opcional y el alta nunca se bloquea por el, pero la proxima apertura reintenta.
   */
  const ensureExchangeGroups = useCallback(() => {
    if (exchangeGroupsRequested.current) return
    exchangeGroupsRequested.current = true
    setExchangeGroupsLoading(true)
    void loadExchangeGroupsForCoachAction().then((res) => {
      setExchangeGroupsLoading(false)
      if (!res.ok) {
        exchangeGroupsRequested.current = false
        return
      }
      setExchangeGroups(res.groups)
    })
  }, [])

  /** El alta solo necesita el subconjunto identificatorio; los grupos se cargan UNA vez. */
  const exchangeGroupOptions = useMemo<FoodEquivalenceGroupOption[]>(
    () =>
      exchangeGroups.map((group) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        isSystem: group.isSystem,
      })),
    [exchangeGroups],
  )

  /**
   * Tras crear, el listado se REAPUNTA al nombre del alimento nuevo en vez de refrescarse.
   *
   * Un `router.refresh()` aca tiraria el RSC del hub entero (roster + picker, dos round-trips)
   * por haber creado un alimento; y aunque no lo hiciera, no serviria: el buscador del tab es
   * estado de cliente, el alimento recien creado casi nunca cae en la busqueda activa ni en la
   * primera pagina de 20 del RPC, y en modo "Editados por mi" directamente no existe (nace sin
   * override). Apuntar la busqueda a su nombre es lo unico que lo pone en pantalla sin F5.
   *
   * F4.5 no cambia eso: el browse ordena por nombre sobre decenas de miles de filas, asi que un
   * alimento nuevo cae en una pagina cualquiera y "volver al catalogo" seria peor que buscarlo.
   * La UNICA excepcion es un nombre demasiado corto para la RPC (1 caracter): ahi la busqueda no
   * saldria nunca, y "Solo mios" si lo muestra — el alimento acaba de nacer con `coach_id` del
   * actor.
   */
  const handleFoodCreated = useCallback(
    (name: string) => {
      const term = name.trim()
      if (term.length < MIN_QUERY) {
        applyFilterMode('mine')
        setQuery('')
        setDebounced('')
        // Si el coach YA estaba en "Solo mios", el modo no cambia y sin esto la lista se quedaria
        // sin el alimento que acaba de crear.
        setSearchNonce((n) => n + 1)
        return
      }
      applyFilterMode('all')
      setQuery(term)
      // Se adelanta el debounce: la busqueda tiene que salir ya, no 400 ms despues de cerrar
      // el sheet. El timer escribira el mismo valor y React descartara el re-render.
      setDebounced(term)
      setSearchNonce((n) => n + 1)
    },
    [applyFilterMode],
  )

  /**
   * Modos paginados por OFFSET (browse / solo mios / editados): primera pagina al entrar al modo.
   * Cambiar de modo (en cualquier direccion, incluida la entrada y salida de `search`) aborta y
   * vacia antes de nada: los cursores keyset y offset no se pueden mezclar.
   *
   * La dependencia es el MODO, no el texto: dentro de `mine`/`edited` el texto filtra en cliente y
   * re-disparar la primera pagina en cada tecla tiraria las paginas que el coach ya cargo.
   */
  useEffect(() => {
    const controller = beginRequest()
    clearResults()
    if (!isOffsetListMode(mode)) return () => controller.abort()

    setLoading(true)
    const request =
      mode === 'edited'
        ? listCoachEditedFoodsHubAction({ offset: 0 })
        : browseFoodCatalogHubAction({ offset: 0, mineOnly: mode === 'mine', countryCode })
    void request.then((res) => {
      if (controller.signal.aborted) return
      if (!res.ok) {
        setError(res.error)
        setLoading(false)
        return
      }
      setItems(res.items)
      setNextOffset(res.nextOffset)
      setHasMore(res.hasMore)
      setLoading(false)
    })
    return () => controller.abort()
    // `searchNonce` no se usa en el cuerpo: es "recarga aunque nada haya cambiado" tras un alta.
    // En el camino normal el modo ya cambia, asi que no agrega ninguna consulta.
  }, [mode, countryCode, beginRequest, clearResults, searchNonce])

  const runSearch = useCallback(
    async (q: string) => {
      const controller = beginRequest()
      setLoading(true)
      setError(null)
      const res = await searchFoodCatalogHubAction({ query: q, countryCode })
      if (controller.signal.aborted) return
      if (!res.ok) {
        setError(res.error)
        setItems([])
        setCursor(null)
        setHasMore(false)
        setLoading(false)
        return
      }
      setItems(res.items)
      setCursor(res.nextCursor)
      setHasMore(res.hasMore)
      setLoading(false)
    },
    [countryCode, beginRequest],
  )

  useEffect(() => {
    // Cualquier otro modo lo atiende el efecto de arriba, que ya aborto y vacio. Sin consulta ni
    // abort aca: abortar mataria la pagina que ese efecto acaba de pedir.
    if (mode !== 'search') return
    void runSearch(debounced)
    // `searchNonce` no se usa en el cuerpo a proposito: es el disparador de "vuelve a buscar
    // lo mismo" tras un alta (ver `handleFoodCreated`).
  }, [debounced, mode, runSearch, searchNonce])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    const controller = beginRequest()
    setLoadingMore(true)

    // El servidor manda el `nextOffset`: el cliente no recalcula tamaños de pagina (browse y
    // "solo mios" no usan el mismo).
    if (isOffsetListMode(mode)) {
      if (nextOffset == null) {
        setLoadingMore(false)
        return
      }
      const res =
        mode === 'edited'
          ? await listCoachEditedFoodsHubAction({ offset: nextOffset })
          : await browseFoodCatalogHubAction({
              offset: nextOffset,
              mineOnly: mode === 'mine',
              countryCode,
            })
      if (controller.signal.aborted) return
      if (!res.ok) {
        setLoadingMore(false)
        return
      }
      setItems((prev) => [...prev, ...res.items])
      setNextOffset(res.nextOffset)
      setHasMore(res.hasMore)
      setLoadingMore(false)
      return
    }

    if (!cursor || debounced.length < MIN_QUERY) {
      setLoadingMore(false)
      return
    }
    const res = await searchFoodCatalogHubAction({ query: debounced, countryCode, cursor })
    if (controller.signal.aborted) return
    if (!res.ok) {
      setLoadingMore(false)
      return
    }
    setItems((prev) => [...prev, ...res.items])
    setCursor(res.nextCursor)
    setHasMore(res.hasMore)
    setLoadingMore(false)
  }, [cursor, loadingMore, debounced, countryCode, mode, nextOffset, beginRequest])

  // En los modos con universo en memoria el texto acota lo YA cargado, sin debounce ni minimo de
  // caracteres (por eso lee `query` y no `debounced`: no hay consulta que ahorrar).
  const visibleItems = useMemo(() => {
    if (!usesLocalTextFilter(mode)) return items
    const q = query.trim()
    if (q === '') return items
    return items.filter((item) => matchesFoodQuery(item, q))
  }, [mode, items, query])

  const cards = useMemo<Array<{ model: FoodCatalogCardModel; item: FoodCatalogItem }>>(
    () => visibleItems.map((item) => ({ model: foodCatalogItemToCardModel(item, SUPABASE_BASE), item })),
    [visibleItems],
  )

  const openDetail = useCallback((item: FoodCatalogItem) => {
    setDetail(foodCatalogItemToDetail(item))
    setDetailItem(item)
    setDetailOpen(true)
  }, [])

  /**
   * La entrada a "clasificar" es la FICHA, no la card. En ancho de telefono la card entera es un
   * unico objetivo tactil (`<button>`): meterle un segundo boton adentro seria HTML invalido
   * (boton anidado) y obligaria a partirla en dos columnas de ~24 px cada una. La ficha, ademas,
   * es donde el coach ya esta viendo las macros — que es justo lo que necesita para decidir los
   * gramos de 1 porcion.
   *
   * Se cierra la ficha al abrir el formulario: dos bottom sheets apilados en un telefono dejan
   * el de abajo asomando bajo el teclado.
   */
  const openClassify = useCallback(() => {
    ensureExchangeGroups()
    setDetailOpen(false)
    setClassifyOpen(true)
  }, [ensureExchangeGroups])

  const handleClassified = useCallback((summary: ClassifiedFoodSummary) => {
    setClassifiedNow((prev) => ({ ...prev, [summary.foodId]: summary }))
  }, [])

  const showInvite = mode === 'invite'
  const showEmpty = !showInvite && !loading && cards.length === 0 && !error
  /**
   * "Todavia no tengo nada de esto" vs. "el texto local no dejo pasar nada": son dos vacios
   * distintos y el coach necesita saber cual esta mirando. Solo aplica a los modos con universo
   * propio — en `browse` un universo vacio significaria catalogo vacio, que no pasa.
   */
  const showEmptyUniverse = usesLocalTextFilter(mode) && showEmpty && items.length === 0

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            mode === 'edited'
              ? 'Filtrar entre tus editados…'
              : mode === 'mine'
                ? 'Filtrar entre tus alimentos…'
                : 'Buscar alimento por nombre o marca…'
          }
          aria-label={
            mode === 'edited'
              ? 'Filtrar entre los alimentos que editaste'
              : mode === 'mine'
                ? 'Filtrar entre los alimentos que creaste'
                : 'Buscar alimento en el catálogo'
          }
          className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-10 text-base text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring md:text-sm"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar busqueda"
            className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-muted"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Los dos chips son EXCLUYENTES: `nextFoodFilterMode` apaga el otro. Se comportan como un
            radio-group con deseleccion, no como dos checkboxes, y por eso `aria-pressed` (un
            toggle real) en vez de `role="radio"`: el estado "ninguno" es legitimo. */}
        <div role="group" aria-label="Filtrar el catalogo" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={filterMode === 'mine'}
            onClick={() => applyFilterMode(nextFoodFilterMode(filterMode, 'mine'))}
            className={
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-xs font-semibold transition-colors ' +
              (filterMode === 'mine'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border-default bg-surface-card text-muted hover:text-strong')
            }
          >
            <User aria-hidden="true" className="size-3.5" />
            Solo míos
          </button>
          <button
            type="button"
            aria-pressed={filterMode === 'edited'}
            onClick={() => applyFilterMode(nextFoodFilterMode(filterMode, 'edited'))}
            className={
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-xs font-semibold transition-colors ' +
              (filterMode === 'edited'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border-default bg-surface-card text-muted hover:text-strong')
            }
          >
            <Pencil aria-hidden="true" className="size-3.5" />
            Editados por mí
          </button>
        </div>

        <AddFoodSheet
          coachId={coachId}
          exchangeGroups={exchangeGroupOptions}
          onOpenChange={(open) => {
            if (open) ensureExchangeGroups()
          }}
          onCreated={handleFoodCreated}
          trigger={
            <button
              type="button"
              className="eva-press inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill bg-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Nuevo alimento
            </button>
          }
        />
      </div>

      {error ? (
        <NutritionStatePanel
          icon="error"
          tone="danger"
          illustration="error-amable"
          title={mode === 'search' ? 'No se pudo buscar' : 'No se pudo cargar el catálogo'}
          description={error}
        />
      ) : showInvite ? (
        // Solo con 1 caracter escrito: la RPC exige 2 y seguir mostrando el catalogo completo bajo
        // un termino a medio escribir se leeria como "esto es lo que encontre". Sin texto, el
        // default del tab ya NO es este panel sino el catalogo (F4.5).
        <NutritionStatePanel
          icon="empty"
          illustration="catalogo-vacio"
          title="Sigue escribiendo"
          description="La búsqueda necesita al menos 2 caracteres. Borra el texto para volver a ver el catálogo completo."
        />
      ) : showEmptyUniverse ? (
        mode === 'edited' ? (
          <NutritionStatePanel
            icon="empty"
            illustration="catalogo-vacio"
            title="Todavía no corregiste ningún alimento"
            description="Cuando corrijas los macros de un alimento del catálogo, aparecerá acá con el ícono ✎. Tus correcciones solo te afectan a ti y a tus planes nuevos."
          />
        ) : (
          <NutritionStatePanel
            icon="empty"
            illustration="catalogo-vacio"
            title="Todavía no creaste ningún alimento"
            description="Con “Nuevo alimento” agregas los tuyos al catálogo: solo los ves tú, y quedan disponibles para todos tus planes."
          />
        )
      ) : showEmpty ? (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description={
            mode === 'edited'
              ? 'Ninguno de tus alimentos editados coincide con ese nombre o marca.'
              : mode === 'mine'
                ? 'Ninguno de tus alimentos coincide con ese nombre o marca.'
                : 'No encontramos alimentos para esa busqueda. Prueba con otro nombre o marca.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {cards.map(({ model, item }) => (
            <li key={model.id}>
              <button
                type="button"
                onClick={() => openDetail(item)}
                className="eva-press flex w-full items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken"
              >
                {model.thumbnailUrl ? (
                  <Image
                    src={model.thumbnailUrl}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    sizes="48px"
                    className="size-12 shrink-0 rounded-control border border-border-subtle object-cover"
                  />
                ) : (
                  <Image
                    src={model.categoryIconUrl}
                    alt=""
                    aria-hidden
                    width={48}
                    height={48}
                    unoptimized
                    loading="lazy"
                    className="size-12 shrink-0 rounded-control border border-border-subtle bg-primary/10 object-contain p-1.5"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-strong">
                      {model.name}
                      {/* Badge ✎: este alimento lleva TUS macros, no los del catálogo (mismo
                          patron que ItemRow del builder). */}
                      {model.hasOverride ? (
                        <span
                          className="ml-1.5 inline-flex items-center align-middle text-primary"
                          title="Corregiste los macros de este alimento"
                        >
                          <Pencil aria-hidden="true" className="h-3 w-3" />
                          <span className="sr-only">Macros corregidos por ti</span>
                        </span>
                      ) : null}
                    </p>
                    {/* "Propio" = lo creaste tu (`coach_id`), no viene del catalogo abierto. Sirve
                        en el listado general (distinguir lo tuyo entre miles de filas de Open Food
                        Facts) y confirma el universo dentro de "Solo mios". */}
                    {model.isOwn ? (
                      <span className="inline-flex h-5 shrink-0 items-center rounded-pill border border-border-subtle bg-surface-sunken px-1.5 text-[10px] font-bold text-muted">
                        Propio
                      </span>
                    ) : null}
                    <span
                      className={
                        'inline-flex h-5 shrink-0 items-center gap-1 rounded-pill border px-1.5 text-[10px] font-bold ' +
                        VERIFICATION_TONE_CLASSES[model.verificationTone]
                      }
                      title={model.verificationTone === 'verified' ? model.verificationLabel : undefined}
                    >
                      {/* QA owner 17-08: chips «Verificado por …» = solo el check (texto a sr-only),
                          mismo trato que el picker. Los demás tonos conservan su texto. */}
                      {model.verificationTone === 'verified' ? (
                        <>
                          <BadgeCheck aria-hidden="true" className="size-3" />
                          <span className="sr-only">{model.verificationLabel}</span>
                        </>
                      ) : (
                        model.verificationLabel
                      )}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {[model.brand, model.packageLabel, model.sourceLabel].filter(Boolean).join(" · ")}
                  </p>
                  {/* Resultado de lo que el coach acaba de clasificar en esta sesion. No se pinta
                      para el resto: el catalogo no emite el grupo, y un chip ausente significaria
                      "no lo se", nunca "sin clasificar". */}
                  {classifiedNow[model.id] ? (
                    <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-pill border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      <Scale aria-hidden="true" className="size-3 shrink-0" />
                      <span className="truncate">
                        {classifiedNow[model.id].groupName
                          ? `${classifiedNow[model.id].groupName}${
                              classifiedNow[model.id].portionGrams != null
                                ? ` · ${classifiedNow[model.id].portionGrams} g`
                                : ''
                            }`
                          : 'Sin clasificar'}
                      </span>
                    </p>
                  ) : null}
                  <div className="mt-1">
                    <MacroChipRow
                      calories={item.calories}
                      proteinG={item.proteinG}
                      carbsG={item.carbsG}
                      fatsG={item.fatsG}
                      per={model.basisLabel}
                      size="sm"
                    />
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && !loading ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
          {loadingMore ? 'Cargando…' : 'Cargar mas'}
        </button>
      ) : null}

      {!showInvite && cards.length > 0 ? (
        <p className="px-1 pt-1 text-center text-[10.5px] leading-relaxed text-subtle">
          {OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION}{" "}
          <a href={OPEN_FOOD_FACTS_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-muted">
            Ver Open Food Facts
          </a>
        </p>
      ) : null}

      <FoodDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        detail={detail}
        loading={false}
        footerAction={
          <button
            type="button"
            onClick={openClassify}
            className="eva-press inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
          >
            <Scale aria-hidden="true" className="size-4" />
            Clasificar en porciones
          </button>
        }
      />

      <ClassifyFoodFlow
        open={classifyOpen}
        onOpenChange={setClassifyOpen}
        food={detailItem}
        groups={exchangeGroups}
        groupsLoading={exchangeGroupsLoading}
        onClassified={handleClassified}
      />
    </div>
  )
}
