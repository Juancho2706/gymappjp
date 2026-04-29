'use client'

import { Badge } from '@/components/ui/badge'
import { Globe, LayoutList, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FoodListItem = {
  id: string
  name: string
  serving_size: number
  serving_unit: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  coach_id: string | null
  category: string | null
}

type Props = {
  items: FoodListItem[]
  coachId: string
  emptyLabel?: string
}

export function FoodListCompact({ items, coachId, emptyLabel = 'No hay alimentos con estos filtros.' }: Props) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
        <LayoutList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Lista compacta
        </span>
      </div>

      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_2.25rem_2.25rem_2.25rem_auto] gap-2 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border/40 bg-muted/10">
        <span>Alimento</span>
        <span className="text-right tabular-nums">Kcal</span>
        <span className="text-right tabular-nums">P</span>
        <span className="text-right tabular-nums">C</span>
        <span className="text-right tabular-nums">G</span>
        <span className="text-right">Origen</span>
      </div>

      <ul className="divide-y divide-border/50">
        {items.map((food) => {
          const isMine = food.coach_id === coachId
          const unitHint =
            food.serving_unit &&
            !['g', 'ml'].includes(food.serving_unit.toLowerCase()) &&
            (food.serving_size ?? 0) > 0
              ? `1 ${food.serving_unit} ≈ ${food.serving_size}g`
              : null

          return (
            <li
              key={food.id}
              className={cn('px-3 py-2.5 md:py-2 transition-colors hover:bg-muted/30', isMine && 'bg-primary/[0.04]')}
            >
              <div className="md:hidden space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm text-foreground leading-snug pr-1 flex items-start gap-1.5 min-w-0">
                    <span className="truncate">{food.name}</span>
                    {isMine ? (
                      <Star className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5 fill-primary/30" aria-hidden />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                    )}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-foreground shrink-0">
                    {food.calories} <span className="text-muted-foreground font-semibold">kcal/100g</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span className="tabular-nums">
                    <span className="text-blue-600/90 dark:text-blue-400 font-bold">P</span> {food.protein_g}g ·{' '}
                    <span className="text-emerald-600/90 dark:text-emerald-400 font-bold">C</span> {food.carbs_g}g ·{' '}
                    <span className="text-purple-600/90 dark:text-purple-400 font-bold">G</span> {food.fats_g}g
                  </span>
                  {food.category?.trim() ? (
                    <Badge variant="secondary" className="text-[9px] h-5 px-1.5 font-bold">
                      {food.category.trim()}
                    </Badge>
                  ) : null}
                  {unitHint ? <span className="text-[10px] opacity-80 w-full sm:w-auto">{unitHint}</span> : null}
                </div>
              </div>

              <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_4.5rem_2.25rem_2.25rem_2.25rem_auto] gap-x-2 items-center text-sm min-h-10">
                <div className="min-w-0 flex flex-col gap-0.5 justify-center py-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate">{food.name}</span>
                    {isMine ? (
                      <Star className="w-3.5 h-3.5 text-primary shrink-0 fill-primary/30" aria-label="Tuyo" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-label="Global" />
                    )}
                    {food.category?.trim() ? (
                      <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-bold shrink-0 hidden lg:inline-flex">
                        {food.category.trim()}
                      </Badge>
                    ) : null}
                  </div>
                  {unitHint ? <span className="text-[10px] text-muted-foreground/85 truncate">{unitHint}</span> : null}
                </div>
                <span className="text-right tabular-nums text-xs font-semibold">{food.calories}</span>
                <span className="text-right tabular-nums text-xs text-blue-600/90 dark:text-blue-400">{food.protein_g}</span>
                <span className="text-right tabular-nums text-xs text-emerald-600/90 dark:text-emerald-400">{food.carbs_g}</span>
                <span className="text-right tabular-nums text-xs text-purple-600/90 dark:text-purple-400">{food.fats_g}</span>
                <span className="text-right text-[10px] text-muted-foreground truncate max-w-[7rem]">
                  {isMine ? 'Propio' : 'Global'}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {items.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm border-t border-dashed border-border/50">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}
