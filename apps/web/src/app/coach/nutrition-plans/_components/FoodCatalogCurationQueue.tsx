'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Barcode, CheckCircle2, ChevronDown, Link2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FoodSearch, type Food } from '@/app/coach/foods/FoodSearch'
import { resolveMissingFoodCodeAction } from '../_actions/curation.actions'

interface MissingCodeRow {
  id: string
  barcode: string
  country_code: string
  sightings: number
  first_seen_at: string
  last_seen_at: string
  resolved_food_id: string | null
  resolved_at: string | null
}

function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime()
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000))
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

export function FoodCatalogCurationQueue() {
  const supabase = useMemo(() => createClient() as unknown as SupabaseClient, [])
  const [rows, setRows] = useState<MissingCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<MissingCodeRow | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    void supabase
      .from('food_catalog_missing_codes')
      .select('id, barcode, country_code, sightings, first_seen_at, last_seen_at, resolved_food_id, resolved_at')
      .is('resolved_at', null)
      .order('last_seen_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!active) return
        if (!error) setRows((data as MissingCodeRow[] | null) ?? [])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [supabase])

  function resolveWithFood(food: Food) {
    if (!selected || isPending) return
    const target = selected
    startTransition(async () => {
      const result = await resolveMissingFoodCodeAction({
        missingCodeId: target.id,
        resolvedFoodId: food.id,
      })
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo vincular el código.')
        return
      }

      setRows((current) => current.filter((row) => row.id !== target.id))
      setSelected(null)
      toast.success(`${target.barcode} vinculado con ${food.name}`)
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-14 items-center justify-center rounded-card border border-subtle bg-surface-card">
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      </div>
    )
  }

  if (rows.length === 0) return null

  return (
    <>
      <details className="group rounded-card border border-amber-300/60 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <Barcode className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-strong">Códigos por revisar</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-black tabular-nums text-amber-700 dark:text-amber-300">
                {rows.length}
              </span>
            </span>
            <span className="mt-0.5 block text-[11px] font-semibold text-muted">
              Productos escaneados que aún no existen en el catálogo local.
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-amber-300/50 px-4 pb-4 pt-3 dark:border-amber-500/20">
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-3 rounded-control border border-subtle bg-surface-card p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-black tracking-wide tabular-nums text-strong">{row.barcode}</p>
                  <p className="mt-1 text-[11px] font-semibold text-muted">
                    {row.country_code} · {row.sightings} {row.sightings === 1 ? 'escaneo' : 'escaneos'} · {formatRelativeDate(row.last_seen_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(row)}
                  className="h-10 gap-1.5"
                >
                  <Link2 className="h-4 w-4" />
                  Vincular alimento
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-control bg-surface-sunken px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />
            Vincular no cambia el alimento ni inventa nutrientes: solo enseña a EVA qué fila local corresponde a ese GTIN.
          </div>
        </div>
      </details>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto border-subtle bg-surface-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-extrabold normal-case tracking-tight text-strong">
              Vincular código {selected?.barcode}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs leading-relaxed text-muted">
            Busca el producto exacto. Si todavía no existe, cierra este diálogo y créalo primero en la biblioteca de alimentos.
          </p>
          <div className={isPending ? 'pointer-events-none opacity-60' : ''}>
            <FoodSearch onFoodSelected={resolveWithFood} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
