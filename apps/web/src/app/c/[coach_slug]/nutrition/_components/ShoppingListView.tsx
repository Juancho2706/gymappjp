'use client'

import { useEffect, useMemo, useOptimistic, useState, useTransition, useId } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Info, Plus, Loader2, Share2, Copy, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover'
import type {
  ShoppingListView as ShoppingList,
  ShoppingItemView,
} from '../_data/shopping.queries'
import {
  toggleShoppingItemAction,
  addManualShoppingItemAction,
  removeManualShoppingItemAction,
} from '../_actions/shopping.actions'

/**
 * Lista de compras del alumno — base tier.
 *
 * Render por pasillo (aisle) con check-off optimista (`toggleShoppingItemAction`),
 * alta de ítem manual, "Compartir por WhatsApp" (wa.me) y copiar al portapapeles.
 * Targets de check ≥44px, tabular-nums en cantidades, color nunca es la única señal
 * (check usa ícono + tachado + aria), cada animación bifurca en `useReducedMotion`.
 */

export interface ShoppingListViewProps {
  list: ShoppingList
  coachSlug: string
}

/** Tooltip accesible con el "por qué" de la lista. */
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

/** Texto legible de la cantidad agregada de una línea (tabular-friendly). */
function quantityLabel(item: ShoppingItemView): string {
  if (item.quantities.length === 0) return ''
  return item.quantities
    .map((q) => `${roundish(q.quantity)} ${q.unit}`)
    .join(' + ')
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/** Texto plano de la lista para compartir/copiar (agrupado por pasillo). */
function buildShareText(list: ShoppingList): string {
  const lines: string[] = ['🛒 Lista de compras']
  for (const aisle of list.aisles) {
    const pending = aisle.items.filter((i) => !i.isChecked)
    if (pending.length === 0) continue
    lines.push('', `*${aisle.category}*`)
    for (const item of pending) {
      const q = quantityLabel(item)
      lines.push(`• ${item.name}${q ? ` — ${q}` : ''}`)
    }
  }
  return lines.join('\n')
}

export function ShoppingListView({ list, coachSlug }: ShoppingListViewProps) {
  const reduce = useReducedMotion()
  const formId = useId()
  const [isPending, startTransition] = useTransition()

  // Estado optimista de checks por `key` (sobre-escribe el server hasta revalidar).
  const [checkedOverrides, setCheckedOverrides] = useOptimistic(
    new Map<string, boolean>(),
    (state, update: { key: string; isChecked: boolean }) => {
      const next = new Map(state)
      next.set(update.key, update.isChecked)
      return next
    }
  )

  const [manualLabel, setManualLabel] = useState('')
  const [addingManual, setAddingManual] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // El alumno autenticado (uid). Las acciones de shopping exigen `clientId` y lo
  // validan contra la sesión server-side (`user.id !== clientId` → no autorizado).
  // Como las props no lo traen, lo derivamos del JWT vía el browser client.
  const [clientId, setClientId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getClaims()
      .then(({ data }) => {
        if (cancelled) return
        const sub = data?.claims?.sub
        if (typeof sub === 'string') setClientId(sub)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const aisles = list.aisles
  const isEmpty = aisles.every((a) => a.items.length === 0)

  const totalCount = useMemo(
    () => aisles.reduce((sum, a) => sum + a.items.length, 0),
    [aisles]
  )
  const checkedCount = useMemo(
    () =>
      aisles.reduce(
        (sum, a) =>
          sum +
          a.items.filter((i) => checkedOverrides.get(i.key) ?? i.isChecked).length,
        0
      ),
    [aisles, checkedOverrides]
  )

  function isChecked(item: ShoppingItemView): boolean {
    return checkedOverrides.get(item.key) ?? item.isChecked
  }

  function handleToggle(item: ShoppingItemView) {
    if (!clientId) return
    const next = !isChecked(item)
    startTransition(async () => {
      setCheckedOverrides({ key: item.key, isChecked: next })
      const res = await toggleShoppingItemAction({
        clientId,
        planId: list.planId,
        label: item.name,
        category: item.category,
        isChecked: next,
        coachSlug,
      })
      if (!res.success) toast.error(res.error ?? 'No se pudo actualizar')
    })
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault()
    const label = manualLabel.trim()
    if (!label || !clientId) return
    setAddingManual(true)
    const res = await addManualShoppingItemAction({
      clientId,
      planId: list.planId,
      label,
      category: null,
      coachSlug,
    })
    setAddingManual(false)
    if (res.success) {
      setManualLabel('')
      toast.success('Agregado a la lista', { icon: '🛒' })
    } else {
      toast.error(res.error ?? 'No se pudo agregar')
    }
  }

  async function handleRemoveManual(item: ShoppingItemView) {
    if (!item.stateId || !clientId) return
    setRemovingId(item.stateId)
    const res = await removeManualShoppingItemAction({
      clientId,
      itemId: item.stateId,
      coachSlug,
    })
    setRemovingId(null)
    if (!res.success) toast.error(res.error ?? 'No se pudo eliminar')
  }

  function handleShareWhatsApp() {
    const text = buildShareText(list)
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleCopy() {
    const text = buildShareText(list)
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Lista copiada', { icon: '📋' })
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-foreground" aria-hidden />
        <h2 className="flex-1 text-base font-black tracking-tight text-foreground">
          Lista de compras
        </h2>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
          {checkedCount}/{totalCount}
        </span>
        <InfoTooltip text="Lista de compras de tu plan — base." />
      </header>

      {/* Acciones de compartir */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleShareWhatsApp}
          disabled={isEmpty}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40 touch-manipulation"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          Compartir por WhatsApp
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={isEmpty}
          aria-label="Copiar lista"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-muted disabled:opacity-40 touch-manipulation"
        >
          <Copy className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Alta manual */}
      <form onSubmit={handleAddManual} className="flex gap-2">
        <label htmlFor={formId} className="sr-only">
          Agregar ítem manual
        </label>
        <input
          id={formId}
          type="text"
          value={manualLabel}
          onChange={(e) => setManualLabel(e.target.value)}
          placeholder="Agregar a la lista..."
          maxLength={200}
          className="h-11 flex-1 rounded-xl border border-input bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={addingManual || manualLabel.trim().length === 0}
          aria-label="Agregar"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-40 touch-manipulation"
        >
          {addingManual ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
        </button>
      </form>

      {isEmpty ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/20 py-10 text-center text-xs text-muted-foreground">
          Tu lista está vacía. Agrega ítems o activa un plan de nutrición.
        </p>
      ) : (
        <div className="space-y-5">
          {aisles
            .filter((a) => a.items.length > 0)
            .map((aisle) => (
              <div key={aisle.category} className="space-y-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {aisle.category}
                </h3>
                <ul className="divide-y divide-border/60">
                  {aisle.items.map((item) => {
                    const checked = isChecked(item)
                    const q = quantityLabel(item)
                    return (
                      <li key={item.key} className="flex items-center gap-3 py-1">
                        <button
                          type="button"
                          onClick={() => handleToggle(item)}
                          disabled={isPending}
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`${item.name}${checked ? ', comprado' : ''}`}
                          className="flex h-11 min-w-11 flex-1 items-center gap-3 text-left touch-manipulation disabled:opacity-60"
                        >
                          <motion.span
                            className={cn(
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                              checked
                                ? 'border-[var(--color-macro-protein)] bg-[var(--color-macro-protein)] text-white'
                                : 'border-border bg-background text-transparent'
                            )}
                            initial={false}
                            animate={
                              reduce ? undefined : { scale: checked ? [1, 1.15, 1] : 1 }
                            }
                            transition={{ duration: 0.2 }}
                            aria-hidden
                          >
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </motion.span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block truncate text-sm font-semibold',
                                checked
                                  ? 'text-muted-foreground line-through'
                                  : 'text-foreground'
                              )}
                            >
                              {item.name}
                            </span>
                            {q && (
                              <span className="block text-[11px] text-muted-foreground tabular-nums">
                                {q}
                              </span>
                            )}
                          </span>
                        </button>
                        {item.isManual && item.stateId && (
                          <button
                            type="button"
                            onClick={() => handleRemoveManual(item)}
                            disabled={removingId === item.stateId}
                            aria-label={`Eliminar ${item.name}`}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 touch-manipulation"
                          >
                            {removingId === item.stateId ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                              <Trash2 className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
