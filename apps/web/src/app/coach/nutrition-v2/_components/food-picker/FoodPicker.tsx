'use client'

/**
 * Picker de alimentos UNIFICADO del coach (Nutrición V2). Una sola pieza para las dos
 * superficies que hoy tenían buscadores distintos: el wizard (builder + reemplazos) y la
 * edición rápida (agregar a la franja + reemplazar un item).
 *
 * Qué resuelve, en orden de importancia para el coach:
 *  1. PRE-BÚSQUEDA: sin escribir nada ya hay tres atajos —lo que él más prescribe (por franja
 *     si la hay), lo que el alumno viene comiendo y sus favoritos—, vía
 *     `get_coach_food_suggestions_v2`.
 *  2. BÚSQUEDA automática con debounce 350 ms (sin botón "Buscar"), mínimo 2 caracteres y
 *     `AbortController` para que una respuesta vieja nunca pise a la nueva.
 *  3. RESULTADOS AGRUPADOS por origen (historial del alumno / mis alimentos / catálogo / con
 *     marca) con expansores "+N", en vez de una lista plana donde lo propio se pierde.
 *  4. MULTI-ADD: el `+` agrega SIN cerrar (la fila pasa a ✓ y se puede repetir) con una barra
 *     viva de "cuánto llevo en esta franja / cuánto me queda del día" y "Listo (n)".
 *     El modo reemplazar (`multiAdd` ausente) sigue siendo un-tap-y-cierra.
 *  5. CREAR INLINE: "Crear «{query}» en tu catálogo" dispara el flujo de alimento libre del
 *     padre con el nombre precargado.
 *  6. RESTRICCIONES del alumno: alergia = fila bloqueada con override explícito;
 *     intolerancia/disgusto = aviso ámbar sin bloquear; favorito = estrellita.
 *
 * REGLA DURA (owner): toda fila muestra SIEMPRE sus macros completas (kcal · P · C · G).
 *
 * Presentación agnóstica: el picker NO decide sheet vs panel. La edición rápida lo monta
 * dentro de `QeBottomSheet` (sheet en móvil / diálogo en desktop) y el builder lo monta como
 * panel inline. Acá solo vive la lista.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, X } from 'lucide-react'
import type { FoodCatalogCursor, FoodCatalogItem, FoodSuggestionItem } from '@eva/nutrition-v2'
import { searchFoodCatalogHubAction } from '../../_actions/food-catalog.actions'
import { getCoachFoodSuggestionsAction } from '../../_actions/food-suggestions.actions'
import {
  canAddFoodPickerItem,
  foodPickerRestrictionIndex,
  foodPickerRestrictionState,
  groupFoodPickerResults,
} from './food-picker-grouping'
import { useFoodPickerPrefs } from './FoodPickerPrefsContext'
import { FoodPickerRow } from './FoodPickerRow'

const MIN_QUERY = 2
const DEBOUNCE_MS = 350
/** Filas visibles por sección antes del expansor "+N". */
const COLLAPSED_LIMIT = 4

/** Totales vivos que el padre recalcula en cada alta (multi-add). */
export interface FoodPickerSummary {
  /** Nombre de la franja en pantalla ("Almuerzo"); vacío ⇒ "Franja". */
  slotLabel?: string | null
  slot: { calories: number; proteinG: number }
  /** `null` = el plan no tiene metas cargadas: no se inventa un "restan". */
  remainingDay?: { calories: number; proteinG: number } | null
}

interface PickerSection {
  key: string
  title: string
  items: FoodCatalogItem[]
  /** Veces prescritas por el coach (solo "Frecuentes tuyos"). */
  usageById?: Record<string, number>
}

export function FoodPicker({
  clientId,
  slotName = null,
  multiAdd = false,
  summary = null,
  allowCustom = false,
  countryCode = 'CL',
  autoFocus = false,
  listClassName = '',
  onPick,
  onCreateCustom,
  onDone,
}: {
  /** Alumno en contexto; `null` en el builder de PLANTILLAS (sin ficha que autorizar). */
  clientId: string | null
  /** Nombre de la franja: filtra "lo que sueles usar" y titula la sección. */
  slotName?: string | null
  /** `true` = agregar varios sin cerrar (barra viva + "Listo (n)"). */
  multiAdd?: boolean
  /** Totales de la franja y restante del día; el padre los recalcula en cada alta. */
  summary?: FoodPickerSummary | null
  /** Ofrece crear un alimento libre/propio con el texto buscado. */
  allowCustom?: boolean
  countryCode?: string
  autoFocus?: boolean
  /**
   * Alto del área scrolleable. En el panel INLINE del wizard se acota (`max-h-*`) para que el
   * scroll viva dentro de la lista y no empuje la página; dentro del sheet se deja vacío porque
   * el scroll ya lo pone la superficie.
   */
  listClassName?: string
  onPick: (item: FoodCatalogItem) => void
  /** El padre abre SU flujo de alimento libre con el nombre precargado. */
  onCreateCustom?: (query: string) => void
  /** Cierra la superficie del padre ("Listo" en multi-add, un-tap en modo reemplazo). */
  onDone?: () => void
}) {
  const prefs = useFoodPickerPrefs()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [coachTop, setCoachTop] = useState<FoodSuggestionItem[]>([])
  const [clientRecent, setClientRecent] = useState<FoodCatalogItem[]>([])
  const [clientFavorites, setClientFavorites] = useState<FoodCatalogItem[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)

  /** Cuántas veces se agregó cada alimento en ESTA sesión del picker (✓ y "×N"). */
  const [addedCounts, setAddedCounts] = useState<Record<string, number>>({})
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(() => new Set())
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [activeIndex, setActiveIndex] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const activeController = useRef<AbortController | null>(null)
  const latestQuery = useRef('')

  useEffect(() => {
    if (!autoFocus) return
    inputRef.current?.focus()
  }, [autoFocus])

  // ── Sugerencias pre-búsqueda ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setSuggestionsLoading(true)
    void getCoachFoodSuggestionsAction({ clientId, slotName: slotName ?? null }).then((res) => {
      if (cancelled) return
      setSuggestionsLoading(false)
      // Sin sugerencias el picker sigue siendo un buscador: no se pinta ningún error.
      if (!res.ok) return
      setCoachTop(res.suggestions.coachTop)
      setClientRecent(res.suggestions.clientRecent)
      setClientFavorites(res.suggestions.clientFavorites)
    }).catch(() => {
      // Espejo del camino de fallo de arriba: sin sugerencias el picker sigue siendo un
      // buscador, no se pinta error (EVA-NEXTJS-19).
      if (cancelled) return
      setSuggestionsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, slotName])

  // ── Búsqueda con debounce ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const runSearch = useCallback(
    async (q: string) => {
      activeController.current?.abort()
      const controller = new AbortController()
      activeController.current = controller
      latestQuery.current = q
      setLoading(true)
      setError(null)
      const res = await searchFoodCatalogHubAction({ query: q, countryCode })
      if (controller.signal.aborted) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        setItems([])
        setCursor(null)
        setHasMore(false)
        return
      }
      setItems(res.items)
      setCursor(res.nextCursor)
      setHasMore(res.hasMore)
      setActiveIndex(0)
    },
    [countryCode],
  )

  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      activeController.current?.abort()
      latestQuery.current = debounced
      setItems([])
      setCursor(null)
      setHasMore(false)
      setError(null)
      setLoading(false)
      setActiveIndex(0)
      return
    }
    void runSearch(debounced)
  }, [debounced, runSearch])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || debounced.length < MIN_QUERY) return
    const q = debounced
    setLoadingMore(true)
    const res = await searchFoodCatalogHubAction({ query: q, countryCode, cursor })
    setLoadingMore(false)
    if (q !== latestQuery.current || !res.ok) return
    setItems((prev) => [...prev, ...res.items])
    setCursor(res.nextCursor)
    setHasMore(res.hasMore)
  }, [cursor, loadingMore, debounced, countryCode])

  // ── Señales del alumno ─────────────────────────────────────────────────────────────────
  const restrictionIndex = useMemo(
    () => foodPickerRestrictionIndex(prefs.restrictions),
    [prefs.restrictions],
  )
  // Favoritos = los declarados en la ficha (prop) MÁS los que devuelve la RPC.
  const favoriteIds = useMemo(() => {
    const set = new Set(prefs.favoriteIds)
    for (const favorite of clientFavorites) set.add(favorite.id)
    return set
  }, [prefs.favoriteIds, clientFavorites])
  const recentIds = useMemo(() => new Set(clientRecent.map((item) => item.id)), [clientRecent])

  const searching = debounced.length >= MIN_QUERY

  // ── Secciones (mismas filas para sugerencias y resultados) ─────────────────────────────
  const sections = useMemo<PickerSection[]>(() => {
    if (searching) {
      return groupFoodPickerResults(items, {
        recentIds,
        viewerCoachId: prefs.viewerCoachId,
        clientName: prefs.clientName,
      }).map((group) => ({ key: group.id, title: group.title, items: group.items }))
    }
    const out: PickerSection[] = []
    if (coachTop.length > 0) {
      const usageById: Record<string, number> = {}
      for (const item of coachTop) if (item.usageCount != null) usageById[item.id] = item.usageCount
      out.push({
        key: 'coach-top',
        title: slotName ? `Sueles usar en ${slotName}` : 'Frecuentes tuyos',
        items: coachTop,
        usageById,
      })
    }
    if (clientRecent.length > 0) {
      out.push({
        key: 'client-recent',
        title: prefs.clientName ? `Recientes de ${prefs.clientName}` : 'Recientes del alumno',
        items: clientRecent,
      })
    }
    if (clientFavorites.length > 0) {
      out.push({
        key: 'client-favorites',
        title: prefs.clientName ? `Favoritos de ${prefs.clientName}` : 'Favoritos del alumno',
        items: clientFavorites,
      })
    }
    return out
  }, [
    searching,
    items,
    recentIds,
    prefs.viewerCoachId,
    prefs.clientName,
    coachTop,
    clientRecent,
    clientFavorites,
    slotName,
  ])

  /**
   * Filas realmente visibles, en orden: es sobre esta lista que corren flechas y Enter.
   * `indexByRow` evita recorrerla por cada fila al pintar (una fila = una clave sección+id).
   */
  const { visible, indexByRow } = useMemo(() => {
    const out: Array<{ item: FoodCatalogItem; sectionKey: string }> = []
    const byRow = new Map<string, number>()
    for (const section of sections) {
      const isExpanded = expanded.has(section.key)
      const slice = isExpanded ? section.items : section.items.slice(0, COLLAPSED_LIMIT)
      for (const item of slice) {
        byRow.set(`${section.key}-${item.id}`, out.length)
        out.push({ item, sectionKey: section.key })
      }
    }
    return { visible: out, indexByRow: byRow }
  }, [sections, expanded])

  const handlePick = useCallback(
    (item: FoodCatalogItem) => {
      const restriction = foodPickerRestrictionState(item.id, restrictionIndex)
      if (!canAddFoodPickerItem(restriction, overrides.has(item.id))) return
      onPick(item)
      if (!multiAdd) {
        onDone?.()
        return
      }
      setAddedCounts((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }))
    },
    [restrictionIndex, overrides, onPick, multiAdd, onDone],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (visible.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % visible.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + visible.length) % visible.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const target = visible[Math.min(activeIndex, visible.length - 1)]
      if (target) handlePick(target.item)
    }
  }

  const addedTotal = useMemo(
    () => Object.values(addedCounts).reduce((total, count) => total + count, 0),
    [addedCounts],
  )
  const showCreateRow = allowCustom && onCreateCustom != null && searching && !loading
  const noResults = searching && !loading && items.length === 0 && error == null
  // Namespace propio: el wizard puede tener DOS pickers montados a la vez (la franja y el de
  // reemplazos de un item), y dos `id` iguales rompen `aria-activedescendant`.
  const domId = useId()
  const listboxId = `${domId}-listbox`
  const optionId = (index: number) => `${domId}-option-${index}`

  return (
    <div className="flex min-h-0 flex-col">
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          role="combobox"
          aria-expanded={visible.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            visible.length > 0 ? optionId(Math.min(activeIndex, visible.length - 1)) : undefined
          }
          aria-label="Buscar alimento"
          placeholder="Buscar alimento…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-11 w-full rounded-control border border-border-default bg-surface-card pl-10 pr-10 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm"
        />
        {loading ? (
          <Loader2 aria-hidden="true" className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-surface-sunken text-muted"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <div className={'mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto ' + listClassName}>
        {!searching && suggestionsLoading && sections.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">Cargando sugerencias…</p>
        ) : null}

        {!searching && !suggestionsLoading && sections.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            Escribe al menos 2 caracteres para buscar en tu catálogo y en el catálogo EVA.
          </p>
        ) : null}

        <div id={listboxId} role="listbox" aria-label="Alimentos" className="space-y-3">
          {sections.map((section) => {
            const isExpanded = expanded.has(section.key)
            const hidden = section.items.length - COLLAPSED_LIMIT
            const slice = isExpanded ? section.items : section.items.slice(0, COLLAPSED_LIMIT)
            return (
              <div key={section.key} role="group" aria-label={section.title}>
                {/* Encabezado de sección caps-mono (T3.v Cabina, mockup `.p-cap`): mismo idioma
                    tipográfico que la leyenda P·C·G y el rail de días. */}
                <p className="px-0.5 pb-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                  {section.title}
                </p>
                <ul role="none" className="space-y-1.5">
                  {slice.map((item) => {
                    const index = indexByRow.get(`${section.key}-${item.id}`) ?? 0
                    const restriction = foodPickerRestrictionState(item.id, restrictionIndex)
                    return (
                      <FoodPickerRow
                        key={`${section.key}-${item.id}`}
                        item={item}
                        optionId={optionId(index)}
                        active={index === activeIndex}
                        addedCount={addedCounts[item.id] ?? 0}
                        favorite={favoriteIds.has(item.id)}
                        restriction={restriction}
                        overridden={overrides.has(item.id)}
                        usageCount={section.usageById?.[item.id] ?? null}
                        onPick={() => handlePick(item)}
                        onOverride={() =>
                          setOverrides((prev) => {
                            const next = new Set(prev)
                            next.add(item.id)
                            return next
                          })
                        }
                        onActivate={() => setActiveIndex(index)}
                      />
                    )
                  })}
                </ul>
                {!isExpanded && hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev)
                        next.add(section.key)
                        return next
                      })
                    }
                    className="mt-1 inline-flex min-h-9 items-center rounded-control px-1 text-xs font-semibold text-primary hover:underline"
                  >
                    +{hidden} más
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {noResults && !showCreateRow ? (
          <p className="py-4 text-center text-sm text-muted">
            No encontramos alimentos para «{debounced}». Prueba con otro nombre o marca.
          </p>
        ) : null}

        {showCreateRow ? (
          <button
            type="button"
            onClick={() => onCreateCustom?.(debounced)}
            className={
              'flex min-h-11 w-full items-center gap-2 rounded-control border border-dashed px-3 text-left text-sm font-semibold transition-colors ' +
              (noResults
                ? 'border-primary/60 bg-primary/5 text-strong hover:bg-primary/10'
                : 'border-border-default bg-surface-card text-muted hover:bg-surface-sunken')
            }
          >
            <Plus aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0 truncate">Crear «{debounced}» en tu catálogo</span>
          </button>
        ) : null}

        {allowCustom && onCreateCustom != null && !searching ? (
          <button
            type="button"
            onClick={() => onCreateCustom('')}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
          >
            <Plus aria-hidden="true" className="size-4" />
            Alimento libre
          </button>
        ) : null}

        {hasMore && !loading ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-control border border-border-default bg-surface-card text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-50"
          >
            {loadingMore ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            Más resultados
          </button>
        ) : null}
      </div>

      {multiAdd ? (
        <div className="sticky bottom-0 -mx-1 mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle bg-surface-card/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface-card/80">
          <div className="min-w-0 text-[11px] leading-tight text-muted" aria-live="polite">
            {summary ? (
              <>
                <p className="font-semibold text-strong">
                  {summary.slotLabel?.trim() || 'Franja'}: {Math.round(summary.slot.calories)} kcal · P{' '}
                  {Math.round(summary.slot.proteinG)} g
                </p>
                {summary.remainingDay ? (
                  <p>
                    {summary.remainingDay.calories >= 0
                      ? `Restan del día: ${Math.round(summary.remainingDay.calories)} kcal · P ${Math.round(summary.remainingDay.proteinG)} g`
                      : `Te pasas del día por ${Math.abs(Math.round(summary.remainingDay.calories))} kcal`}
                  </p>
                ) : null}
              </>
            ) : (
              <p>Agrega los que quieras y cierra al terminar.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDone?.()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Listo{addedTotal > 0 ? ` (${addedTotal})` : ''}
          </button>
        </div>
      ) : null}
    </div>
  )
}
