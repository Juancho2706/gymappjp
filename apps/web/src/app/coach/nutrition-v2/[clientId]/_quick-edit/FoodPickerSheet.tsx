'use client'

/**
 * Bottom sheet de busqueda de catalogo para el modo edicion: swap de un item existente o
 * agregar alimento a una franja. Reusa por import searchFoodCatalogCoachAction y
 * FoodResultCard del builder (sin editarlos). El buscador replica el minimo del
 * FoodSearch interno de PlanBuilderClient.tsx (no exportado; nota de origen — regla de
 * archivos disjuntos del diseno QE §5).
 */

import { useRef, useState } from 'react'
import { Loader2, Plus, Search } from 'lucide-react'
import type { FoodCatalogCursor, FoodCatalogItem } from '@eva/nutrition-v2'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { searchFoodCatalogCoachAction } from '../builder/_actions/builder.actions'
import { FoodResultCard } from '../builder/_components/FoodResultCard'
import type { BuilderFood } from '../builder/_lib/draft-builder'
import { QE_COPY } from './microcopy'

function mapCatalogItemToFood(item: FoodCatalogItem): BuilderFood {
  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatsG: item.fatsG,
    fiberG: item.fiberG,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    category: item.category,
    media: item.media,
  }
}

export function FoodPickerSheet({
  open,
  title,
  clientId,
  allowCustom = false,
  onPick,
  onPickCustom,
  onOpenChange,
}: {
  open: boolean
  title: string
  clientId: string
  /** Muestra el fallback "Alimento libre" (solo al AGREGAR, no al swapear). */
  allowCustom?: boolean
  onPick: (food: BuilderFood) => void
  onPickCustom?: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const activeQuery = useRef('')

  function resetResults() {
    setItems([])
    setCursor(null)
    setHasMore(false)
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setQuery('')
      resetResults()
    }
    onOpenChange(next)
  }

  async function run() {
    const q = query.trim()
    if (q.length === 0) return
    setLoading(true)
    setError(null)
    activeQuery.current = q
    const res = await searchFoodCatalogCoachAction({ clientId, query: q })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      setItems([])
      setCursor(null)
      setHasMore(false)
      return
    }
    setItems(res.result.items)
    setCursor(res.result.nextCursor)
    setHasMore(res.result.hasMore)
  }

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const res = await searchFoodCatalogCoachAction({ clientId, query: activeQuery.current, cursor })
    setLoadingMore(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setItems((prev) => [...prev, ...res.result.items])
    setCursor(res.result.nextCursor)
    setHasMore(res.result.hasMore)
  }

  function pick(item: FoodCatalogItem) {
    onPick(mapCatalogItemToFood(item))
    handleOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card"
      >
        <SheetHeader className="border-border-subtle bg-transparent p-4 pb-3 dark:border-border-subtle">
          <SheetTitle className="pr-10 font-display text-base font-semibold normal-case tracking-tight text-strong">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
          <div className="flex gap-2">
            <input
              className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm"
              type="search"
              inputMode="search"
              aria-label="Buscar alimento del catalogo"
              placeholder="Buscar alimento del catalogo"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void run()
                }
              }}
            />
            <button
              type="button"
              onClick={() => void run()}
              disabled={loading}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control bg-primary/100 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar
            </button>
          </div>

          {allowCustom && onPickCustom ? (
            <button
              type="button"
              onClick={() => {
                onPickCustom()
                handleOpenChange(false)
              }}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="h-4 w-4" />
              {QE_COPY.freeFood}
            </button>
          ) : null}

          {error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}

          {items.length > 0 ? (
            <div className="mt-3 space-y-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <FoodResultCard item={item} onPick={() => pick(item)} />
                  </li>
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-control border border-border-default bg-surface-card text-xs font-semibold text-strong transition-colors hover:bg-surface-sunken disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Mas resultados
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 pb-6 text-center text-sm text-muted">
              Busca en tu catalogo y el catalogo EVA para {allowCustom ? 'agregar' : 'reemplazar'} el alimento.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
