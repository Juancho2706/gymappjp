'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Loader2, Pencil, Plus, Scale, Search, X } from 'lucide-react'
import { MacroChipRow, NutritionStatePanel } from '@/components/nutrition-v2'
import { FoodDetailSheet } from '@/components/coach/FoodDetailSheet'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  type FoodDetailData,
  type FoodVerificationTone,
} from '@/lib/food-detail'
import type { FoodCatalogItem, FoodCatalogCursor } from '@eva/nutrition-v2'
// T2.3 F2 — el alta vive donde ya estaba: el contrato server (`saveCustomFood`) no cambia y
// mudar el archivo es trabajo de F5, cuando `/coach/foods` se borre. El gate
// `check:nutrition-v2-boundaries` es una lista negra de shells V1 (NutritionShell, NutritionHub,
// PlanBuilder, `/nutrition/_components/`, flags), no una prohibición de importar dominio V1.
import { AddFoodSheet } from '@/app/coach/foods/_components/AddFoodSheet'
import type { FoodEquivalenceGroupOption } from '@/app/coach/foods/_components/FoodEquivalenceFields'
import type { ExchangeGroup } from '@eva/nutrition-engine'
import { loadExchangeGroupsForCoachAction } from '../[clientId]/builder/_components/PortionsGroupsAction'
import { ClassifyFoodFlow, type ClassifiedFoodSummary } from './ClassifyFoodFlow'
import {
  foodCatalogItemToCardModel,
  foodCatalogItemToDetail,
  type FoodCatalogCardModel,
} from '../_lib/food-catalog-card'
import { matchesFoodQuery } from '../_lib/edited-foods'
import {
  listCoachEditedFoodsHubAction,
  searchFoodCatalogHubAction,
} from '../_actions/food-catalog.actions'

const MIN_QUERY = 2
const DEBOUNCE_MS = 400

/**
 * El filtro "Editados por mi" vive en la URL igual que el tab (`?tab=`), y por la MISMA razon:
 * `history.replaceState` sobre `window.location.search` en vivo, nunca `router.replace` — este
 * refetchearia el RSC de la pagina (roster + picker) por tocar un chip. El param se omite en su
 * default (sin filtro), como hacen el tab y los filtros del roster.
 */
const FILTER_PARAM = 'foods'
const FILTER_VALUE = 'editados'

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
 * Buscador del catalogo del tab Alimentos, con dos modos de lectura EXCLUYENTES:
 *
 *  - normal: `search_food_catalog_v2` por nombre/marca, minimo 2 caracteres, paginado por
 *    keyset cursor;
 *  - "Editados por mi": la pagina de `coach_food_overrides` del coach, paginada por OFFSET, y
 *    la busqueda por nombre se resuelve EN CLIENTE sobre el universo ya cargado (decenas de
 *    filas) — sin minimo de caracteres, porque no hay consulta que gastar.
 *
 * Los dos cursores son incompatibles, asi que cambiar de modo aborta lo que este en vuelo y
 * vacia items/cursor/offset. El guard de respuestas viejas es el propio `AbortController`
 * compartido: una respuesta cuyo controller ya fue abortado se descarta, venga del modo que
 * venga (comparar solo el texto de la busqueda dejaba pasar la respuesta del otro modo).
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
  const [editedOnly, setEditedOnly] = useState<boolean>(
    () => searchParams.get(FILTER_PARAM) === FILTER_VALUE,
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
   * Fuerza la busqueda aunque el texto no cambie. Hace falta en el caso MAS comun del alta:
   * el coach busca "pollo grillado", no lo encuentra, lo crea — y el termino ya era ese, asi
   * que reescribirlo no dispararia ninguna consulta y el alimento nuevo no aparecería.
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

  /** Espeja el filtro en la URL sin navegar ni tocar el historial (patron de `?tab=`). */
  const applyEditedOnly = useCallback((next: boolean) => {
    setEditedOnly(next)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (next) params.set(FILTER_PARAM, FILTER_VALUE)
    else params.delete(FILTER_PARAM)
    const qs = params.toString()
    const path = window.location.pathname
    window.history.replaceState(window.history.state, '', qs ? `${path}?${qs}` : path)
  }, [])

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
   */
  const handleFoodCreated = useCallback(
    (name: string) => {
      const term = name.trim()
      applyEditedOnly(false)
      setQuery(term)
      // Se adelanta el debounce: la busqueda tiene que salir ya, no 400 ms despues de cerrar
      // el sheet. El timer escribira el mismo valor y React descartara el re-render.
      setDebounced(term)
      setSearchNonce((n) => n + 1)
    },
    [applyEditedOnly],
  )

  // Modo filtro: primera pagina de mis correcciones. Cambiar de modo (en cualquier direccion)
  // aborta y vacia antes de nada: los cursores keyset y offset no se pueden mezclar.
  useEffect(() => {
    const controller = beginRequest()
    clearResults()
    if (!editedOnly) return () => controller.abort()

    setLoading(true)
    void listCoachEditedFoodsHubAction({ offset: 0 }).then((res) => {
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
  }, [editedOnly, beginRequest, clearResults])

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
    // En modo filtro la busqueda es local: ni consulta ni abort (abortar aca mataria la carga
    // de la pagina de correcciones, que corre en el efecto de arriba).
    if (editedOnly) return
    if (debounced.length < MIN_QUERY) {
      activeController.current?.abort()
      setItems([])
      setCursor(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }
    void runSearch(debounced)
    // `searchNonce` no se usa en el cuerpo a proposito: es el disparador de "vuelve a buscar
    // lo mismo" tras un alta (ver `handleFoodCreated`).
  }, [debounced, editedOnly, runSearch, searchNonce])

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    const controller = beginRequest()
    setLoadingMore(true)

    if (editedOnly) {
      if (nextOffset == null) {
        setLoadingMore(false)
        return
      }
      const res = await listCoachEditedFoodsHubAction({ offset: nextOffset })
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
  }, [cursor, loadingMore, debounced, countryCode, editedOnly, nextOffset, beginRequest])

  // En modo filtro el texto acota lo YA cargado, sin debounce ni minimo de caracteres.
  const visibleItems = useMemo(() => {
    if (!editedOnly) return items
    const q = query.trim()
    if (q === '') return items
    return items.filter((item) => matchesFoodQuery(item, q))
  }, [editedOnly, items, query])

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

  const showInvite = !editedOnly && debounced.length < MIN_QUERY
  const showEmpty = !showInvite && !loading && cards.length === 0 && !error
  // Sin correcciones todavia vs. correcciones que el texto local dejo fuera: son dos vacios
  // distintos y el coach necesita saber cual de los dos esta mirando.
  const showNoEdited = editedOnly && showEmpty && items.length === 0

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
            editedOnly ? 'Filtrar entre tus editados…' : 'Buscar alimento por nombre o marca…'
          }
          aria-label={
            editedOnly
              ? 'Filtrar entre los alimentos que editaste'
              : 'Buscar alimento en el catalogo'
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
        <div role="group" aria-label="Filtrar el catalogo" className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={editedOnly}
            onClick={() => applyEditedOnly(!editedOnly)}
            className={
              'inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-xs font-semibold transition-colors ' +
              (editedOnly
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
        <NutritionStatePanel icon="error" tone="danger" illustration="error-amable" title="No se pudo buscar" description={error} />
      ) : showInvite ? (
        <NutritionStatePanel
          icon="empty"
          illustration="catalogo-vacio"
          title="Busca en el catalogo"
          description="Escribe al menos 2 caracteres para encontrar alimentos por nombre o marca."
        />
      ) : showNoEdited ? (
        <NutritionStatePanel
          icon="empty"
          illustration="catalogo-vacio"
          title="Todavía no corregiste ningún alimento"
          description="Cuando corrijas los macros de un alimento del catálogo, aparecerá acá con el ícono ✎. Tus correcciones solo te afectan a ti y a tus planes nuevos."
        />
      ) : showEmpty ? (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description={
            editedOnly
              ? 'Ninguno de tus alimentos editados coincide con ese nombre o marca.'
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
                    <span
                      className={
                        'inline-flex h-5 shrink-0 items-center rounded-pill border px-1.5 text-[10px] font-bold ' +
                        VERIFICATION_TONE_CLASSES[model.verificationTone]
                      }
                    >
                      {model.verificationLabel}
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
