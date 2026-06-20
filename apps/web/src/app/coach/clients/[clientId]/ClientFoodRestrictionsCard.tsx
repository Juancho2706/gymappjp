'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { AlertTriangle, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { searchCoachFoodLibrary } from '@/app/coach/nutrition-plans/_actions/food-library.actions'
import {
  getClientFoodRestrictions,
  setClientFoodRestriction,
  type ClientFoodRestriction,
  type ClientFoodRestrictionType,
} from '@/app/coach/nutrition-plans/_actions/nutrition-coach.actions'

/**
 * Manager de restricciones dietarias del alumno (A2/A3) para la ficha del coach. El coach marca
 * alimentos como ALERGIA / intolerancia / "no le gusta" — el PlanBuilder los advierte (dislike) o
 * bloquea con override (alergia) al armar el plan. Escribe SOLO `client_food_preferences` vía
 * server action coach-scoped (RLS "coach manage client prefs"). NO toca el plan ni borra datos.
 *
 * Self-contained: trae sus restricciones al montar y tiene su propia búsqueda (no reusa el
 * FoodSearchDrawer del builder para no tocar el flujo crítico de armado de planes).
 */

type FoodHit = { id: string; name: string; category?: string | null; brand?: string | null }

const TYPE_META: Record<
  ClientFoodRestrictionType,
  { label: string; chip: string; dot: string }
> = {
  allergy: {
    label: 'Alergia',
    chip: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  intolerance: {
    label: 'Intolerancia',
    chip: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  dislike: {
    label: 'No le gusta',
    chip: 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-white/15 dark:bg-white/5 dark:text-zinc-300',
    dot: 'bg-zinc-400',
  },
}

const TYPE_ORDER: ClientFoodRestrictionType[] = ['allergy', 'intolerance', 'dislike']

export function ClientFoodRestrictionsCard({
  clientId,
  coachId,
}: {
  clientId: string
  coachId: string
}) {
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ClientFoodRestriction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Búsqueda
  const [addType, setAddType] = useState<ClientFoodRestrictionType>('allergy')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    getClientFoodRestrictions(clientId).then((rows) => {
      if (!cancelled) {
        setItems(rows)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [clientId])

  // Buscar alimentos (debounce) solo con el panel abierto y término >= 2.
  useEffect(() => {
    if (!open) return
    const q = term.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { foods } = await searchCoachFoodLibrary(coachId, { search: q, pageSize: 20, page: 0 })
        if (!cancelled) setResults((foods as FoodHit[]) ?? [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [term, open, coachId])

  const restrictedIds = new Set(items.map((i) => i.food_id))

  const add = useCallback(
    (food: FoodHit, type: ClientFoodRestrictionType) => {
      // Optimista
      const prev = items
      setItems((cur) => [
        ...cur.filter((i) => i.food_id !== food.id),
        { food_id: food.id, name: food.name, preference_type: type },
      ])
      setTerm('')
      setResults([])
      startTransition(async () => {
        const res = await setClientFoodRestriction({ clientId, foodId: food.id, preferenceType: type })
        if (!res.success) {
          setItems(prev)
          toast.error(res.error || 'No se pudo guardar.')
          return
        }
        toast.success(`${food.name}: ${TYPE_META[type].label.toLowerCase()}`)
      })
    },
    [clientId, items]
  )

  const remove = useCallback(
    (foodId: string) => {
      const prev = items
      setItems((cur) => cur.filter((i) => i.food_id !== foodId))
      startTransition(async () => {
        const res = await setClientFoodRestriction({ clientId, foodId, preferenceType: null })
        if (!res.success) {
          setItems(prev)
          toast.error(res.error || 'No se pudo quitar.')
        }
      })
    },
    [clientId, items]
  )

  const allergyCount = items.filter((i) => i.preference_type === 'allergy').length

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              allergyCount > 0
                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-foreground">
              Restricciones alimentarias
              {loaded && items.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[9px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
              Alergias / intolerancias que el plan debe respetar
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="overflow-hidden border-t border-border"
          >
            <div className="space-y-4 p-4">
              {/* Tipo a agregar */}
              <div className="flex gap-1.5">
                {TYPE_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAddType(t)}
                    className={cn(
                      'flex-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors',
                      addType === t
                        ? TYPE_META[t].chip
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>

              {/* Búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder={`Buscar alimento para marcar como ${TYPE_META[addType].label.toLowerCase()}…`}
                  className="h-11 rounded-xl pl-9"
                />
                {term && (
                  <button
                    type="button"
                    onClick={() => setTerm('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                    aria-label="Limpiar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {term.trim().length >= 2 && (
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-1.5">
                  {searching && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                  {!searching && results.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">Sin resultados.</p>
                  )}
                  {!searching &&
                    results.map((f) => {
                      const already = restrictedIds.has(f.id)
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={already || isPending}
                          onClick={() => add(f, addType)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
                        >
                          <span className="min-w-0 truncate text-foreground">
                            {f.name}
                            {f.brand && <span className="ml-1.5 text-[10px] text-muted-foreground">{f.brand}</span>}
                          </span>
                          {already ? (
                            <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">Ya marcado</span>
                          ) : (
                            <Plus className="h-4 w-4 shrink-0 text-primary" />
                          )}
                        </button>
                      )
                    })}
                </div>
              )}

              {/* Chips actuales agrupados por tipo */}
              {loaded && items.length === 0 && (
                <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-3 text-center text-xs text-muted-foreground">
                  Sin restricciones. Marca alergias o intolerancias para que el plan las respete.
                </p>
              )}
              {TYPE_ORDER.map((t) => {
                const group = items.filter((i) => i.preference_type === t)
                if (group.length === 0) return null
                return (
                  <div key={t} className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span className={cn('h-2 w-2 rounded-full', TYPE_META[t].dot)} />
                      {TYPE_META[t].label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.map((i) => (
                        <span
                          key={i.food_id}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                            TYPE_META[t].chip
                          )}
                        >
                          {i.name}
                          <button
                            type="button"
                            onClick={() => remove(i.food_id)}
                            disabled={isPending}
                            aria-label={`Quitar ${i.name}`}
                            className="-mr-0.5 rounded-full p-0.5 transition-opacity hover:opacity-70 disabled:opacity-40"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
