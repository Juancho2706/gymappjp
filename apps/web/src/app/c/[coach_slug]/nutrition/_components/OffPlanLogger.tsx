'use client'

import { useEffect, useId, useMemo, useState, useTransition } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X, Plus, Info, Loader2, History } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover'
import { addIntakeEntryAction } from '../_actions/intake.actions'
import type { IntakeSource } from '@/services/nutrition-intake.service'

/**
 * Registro fuera de plan (off-plan intake) del alumno — base tier.
 *
 * Botón "Registrar algo más" → bottom-sheet centrado (max-w-lg, desktop-safe)
 * con búsqueda debounced sobre el catálogo del coach (RLS: global + coach propio)
 * y una fila de "Recientes" de quick-add. Inserta vía `addIntakeEntryAction`
 * (el `clientId` lo deriva la sesión, nunca el body).
 *
 * Movimiento: cada animación bifurca en `useReducedMotion`. Targets ≥44px,
 * tabular-nums en cantidades, color nunca es la única señal.
 */

const SEARCH_UNIT = 'g'
const DEFAULT_QUANTITY = 100
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2

/** Resultado mínimo del catálogo para registrar una entrada. */
type FoodHit = {
  id: string
  name: string
  brand: string | null
  serving_size: number | null
  serving_unit: string | null
  is_liquid: boolean | null
}

export interface OffPlanLoggerProps {
  /** Alimentos usados recientemente (quick-add). */
  recents: { id: string; name: string }[]
  coachSlug: string
  /** Fecha del día activo (YYYY-MM-DD) a la que se imputa el registro. */
  today: string
}

/** Tooltip accesible con el "por qué" del registro fuera de plan. */
function InfoTooltip({ text }: { text: string }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label="Más información"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
      >
        <Info className="h-4 w-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <PopoverDescription className="text-xs leading-relaxed">{text}</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}

export function OffPlanLogger({ recents, coachSlug, today }: OffPlanLoggerProps) {
  const reduce = useReducedMotion()
  const supabase = useMemo(() => createClient(), [])
  const titleId = useId()

  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<FoodHit[]>([])
  const [searching, setSearching] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Reset transient state cada vez que se abre la hoja.
  useEffect(() => {
    if (open) {
      setTerm('')
      setResults([])
    }
  }, [open])

  // Búsqueda debounced sobre el catálogo (RLS scope: global + coach del alumno).
  useEffect(() => {
    if (!open) return
    const trimmed = term.trim()
    if (trimmed.length < SEARCH_MIN_CHARS) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, brand, serving_size, serving_unit, is_liquid')
        .ilike('name_search', `%${trimmed}%`)
        .order('name')
        .limit(30)
      if (cancelled) return
      if (error) {
        setResults([])
      } else {
        setResults((data as FoodHit[]) ?? [])
      }
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term, open, supabase])

  async function logFood(foodId: string, name: string, source: IntakeSource = 'offplan') {
    setPendingId(foodId)
    const unit = SEARCH_UNIT
    const res = await addIntakeEntryAction({
      coachSlug,
      logDate: today,
      foodId,
      quantity: DEFAULT_QUANTITY,
      unit,
      source,
    })
    setPendingId(null)
    if (res.success) {
      toast.success(`${name} agregado`, { icon: '✅' })
      startTransition(() => setOpen(false))
    } else {
      toast.error(res.error ?? 'No se pudo registrar')
    }
  }

  const trimmed = term.trim()
  const showEmpty = !searching && trimmed.length >= SEARCH_MIN_CHARS && results.length === 0
  const hasRecents = recents.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-control border border-dashed border-border bg-background px-4 text-sm font-bold text-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40 touch-manipulation"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Registrar algo más
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="Cerrar"
              className="fixed inset-0 z-50 bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-border bg-background pb-safe md:bottom-4 md:rounded-3xl md:border"
              initial={{ y: reduce ? 0 : '100%' }}
              animate={{ y: 0 }}
              exit={{ y: reduce ? 0 : '100%' }}
              transition={{ type: 'tween', duration: reduce ? 0 : 0.22, ease: 'easeOut' }}
            >
              <div
                className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30"
                aria-hidden
              />
              <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                <h3
                  id={titleId}
                  className="min-w-0 flex-1 truncate text-base font-black tracking-tight text-foreground"
                >
                  Registrar algo más
                </h3>
                <InfoTooltip text="Registra algo que comiste fuera del plan — base." />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="px-4 pb-2">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Buscar alimento (ej: Pollo, Manzana...)"
                    aria-label="Buscar alimento"
                    autoFocus
                    className="h-11 w-full rounded-xl border border-input bg-muted/30 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  {searching && (
                    <Loader2
                      className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground/60"
                      aria-hidden
                    />
                  )}
                </div>
              </div>

              {/* Recientes — quick-add (solo cuando no hay búsqueda activa). */}
              {hasRecents && trimmed.length < SEARCH_MIN_CHARS && (
                <div className="px-4 pb-2">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <History className="h-3.5 w-3.5" aria-hidden />
                    Recientes
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recents.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => logFood(r.id, r.name, 'recent')}
                        className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50 touch-manipulation"
                      >
                        {pendingId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                        <span className="truncate">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="flex-1 overflow-y-auto px-4 pb-6"
                style={{ minHeight: '6rem' }}
              >
                {trimmed.length < SEARCH_MIN_CHARS && !hasRecents && (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    Escribe al menos 2 letras para buscar un alimento del catálogo.
                  </p>
                )}
                {showEmpty && (
                  <p className="py-10 text-center text-xs text-muted-foreground">
                    No se encontraron alimentos con &ldquo;{trimmed}&rdquo;.
                  </p>
                )}
                {results.length > 0 && (
                  <motion.ul
                    className="divide-y divide-border/60"
                    initial="hidden"
                    animate="show"
                    variants={
                      reduce
                        ? undefined
                        : {
                            hidden: {},
                            show: { transition: { staggerChildren: 0.03 } },
                          }
                    }
                  >
                    {results.map((f) => {
                      const isPending = pendingId === f.id
                      return (
                        <motion.li
                          key={f.id}
                          variants={
                            reduce
                              ? undefined
                              : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }
                          }
                        >
                          <button
                            type="button"
                            disabled={pendingId !== null}
                            onClick={() => logFood(f.id, f.name, 'offplan')}
                            className="flex min-h-12 w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 disabled:opacity-50 touch-manipulation"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {f.name}
                              </span>
                              {f.brand && (
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {f.brand}
                                </span>
                              )}
                            </span>
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
                              aria-hidden
                            >
                              {isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
                            </span>
                          </button>
                        </motion.li>
                      )
                    })}
                  </motion.ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
