'use client'

import { useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { FoodCatalogCursor, FoodCatalogItem } from '@eva/nutrition-v2'
import type { BuilderFood } from '../_lib/draft-builder'
import {
  searchFoodCatalogCoachAction,
  searchFoodCatalogForCoachAction,
} from '../_actions/builder.actions'
import { mapCatalogItemToFood } from '../_lib/builder-view-model'
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../_lib/builder-ui-classes'
import { FoodResultCard } from './FoodResultCard'
import { useIsTemplateMode } from './TemplateModeContext'

export function FoodSearch({ clientId, onPick }: { clientId: string; onPick: (food: BuilderFood) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<FoodCatalogItem[]>([])
  const [cursor, setCursor] = useState<FoodCatalogCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const activeQuery = useRef('')
  // Modo plantilla: no hay alumno que autorizar, asi que el catalogo se pide por la puerta
  // coach-scoped (mismo gate, mismo RPC, sin `clientId` inventado).
  const templateMode = useIsTemplateMode()
  const search = (input: { query: string; cursor?: FoodCatalogCursor }) =>
    templateMode
      ? searchFoodCatalogForCoachAction(input)
      : searchFoodCatalogCoachAction({ clientId, ...input })

  async function run() {
    const q = query.trim()
    if (q.length === 0) return
    setLoading(true)
    setError(null)
    activeQuery.current = q
    const res = await search({ query: q })
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
    const res = await search({ query: activeQuery.current, cursor })
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
    setItems([])
    setCursor(null)
    setHasMore(false)
    setQuery('')
  }

  return (
    <div className="rounded-control border border-border-subtle bg-surface-sunken p-3">
      <div className="flex gap-2">
        <input
          className={inputClass}
          type="search"
          inputMode="search"
          aria-label="Buscar alimento del catalogo"
          placeholder="Buscar alimento del catalogo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void run()
            }
          }}
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className={primaryButtonClass + ' shrink-0 px-3'}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Buscar
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p> : null}
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">
          {/* Filas horizontales delgadas a UNA columna (QA CEO 08-04): nombre y macros de
              izquierda a derecha sin truncar — el scroll vive DENTRO de la lista (max-h),
              no en la pagina. */}
          <ul className="grid max-h-[26rem] grid-cols-1 gap-2 overflow-y-auto pr-1 md:max-h-[22rem]">
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
              className={secondaryButtonClass + ' min-h-9 w-full justify-center text-xs'}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Mas resultados
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
