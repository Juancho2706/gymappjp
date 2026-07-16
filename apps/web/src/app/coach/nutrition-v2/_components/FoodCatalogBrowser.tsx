'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { ImageIcon, Loader2, Search, X } from 'lucide-react'
import { NutritionStatePanel } from '@/components/nutrition-v2'
import { FoodDetailSheet } from '@/components/coach/FoodDetailSheet'
import {
  OPEN_FOOD_FACTS_GENERIC_ATTRIBUTION,
  OPEN_FOOD_FACTS_URL,
  type FoodDetailData,
  type FoodVerificationTone,
} from '@/lib/food-detail'
import type { FoodCatalogItem, FoodCatalogCursor } from '@eva/nutrition-v2'
import {
  foodCatalogItemToCardModel,
  foodCatalogItemToDetail,
  type FoodCatalogCardModel,
} from '../_lib/food-catalog-card'
import { searchFoodCatalogHubAction } from '../_actions/food-catalog.actions'

const MIN_QUERY = 2
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

export function FoodCatalogBrowser({ countryCode = 'CL' }: { countryCode?: string }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<FoodDetailData | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const activeController = useRef<AbortController | null>(null)
  const latestQuery = useRef('')

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
      return
    }
    void runSearch(debounced)
  }, [debounced, runSearch])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || debounced.length < MIN_QUERY) return
    const q = debounced
    setLoadingMore(true)
    const res = await searchFoodCatalogHubAction({ query: q, countryCode, cursor })
    if (q !== latestQuery.current) return
    if (!res.ok) {
      setLoadingMore(false)
      return
    }
    setItems((prev) => [...prev, ...res.items])
    setCursor(res.nextCursor)
    setHasMore(res.hasMore)
    setLoadingMore(false)
  }, [cursor, loadingMore, debounced, countryCode])

  const cards = useMemo<Array<{ model: FoodCatalogCardModel; item: FoodCatalogItem }>>(
    () => items.map((item) => ({ model: foodCatalogItemToCardModel(item, SUPABASE_BASE), item })),
    [items],
  )

  const openDetail = useCallback((item: FoodCatalogItem) => {
    setDetail(foodCatalogItemToDetail(item))
    setDetailOpen(true)
  }, [])

  const showInvite = debounced.length < MIN_QUERY
  const showEmpty = !showInvite && !loading && cards.length === 0 && !error

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar alimento por nombre o marca…"
          aria-label="Buscar alimento en el catalogo"
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

      {error ? (
        <NutritionStatePanel icon="error" tone="danger" illustration="error-amable" title="No se pudo buscar" description={error} />
      ) : showInvite ? (
        <NutritionStatePanel
          icon="empty"
          illustration="catalogo-vacio"
          title="Busca en el catalogo"
          description="Escribe al menos 2 caracteres para encontrar alimentos por nombre o marca."
        />
      ) : showEmpty ? (
        <NutritionStatePanel
          icon="empty"
          illustration="sin-resultados"
          title="Sin resultados"
          description="No encontramos alimentos para esa busqueda. Prueba con otro nombre o marca."
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
                  <span
                    aria-hidden
                    className="flex size-12 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface-sunken text-subtle"
                  >
                    <ImageIcon className="size-5" />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-strong">{model.name}</p>
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
                  <p className="eva-mono mt-1 truncate text-[11px] tabular-nums text-subtle">
                    {model.calories} kcal · P {model.proteinG} · C {model.carbsG} · G {model.fatsG}
                    <span className="ml-1 text-subtle">({model.basisLabel})</span>
                  </p>
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

      <FoodDetailSheet open={detailOpen} onOpenChange={setDetailOpen} detail={detail} loading={false} />
    </div>
  )
}
