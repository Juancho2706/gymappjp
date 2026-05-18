'use client'

import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Scale, Apple } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { coachCheckinNutritionCaution } from '@/lib/nutrition-checkin-coach-copy'

export type NutritionCheckInLite = {
  created_at: string
  weight: number | null
  energy_level: number | null
}

type Props = {
  recentCheckIns: NutritionCheckInLite[]
  nutritionWeeklyAvgPct: number
}

export function NutritionCheckinContextCard({ recentCheckIns, nutritionWeeklyAvgPct }: Props) {
  const rows = useMemo(() => {
    return [...recentCheckIns]
      .filter((c) => c.weight != null && Number.isFinite(Number(c.weight)))
      .slice(0, 5)
      .map((c) => ({
        at: c.created_at,
        label: format(parseISO(c.created_at.length > 10 ? c.created_at : `${c.created_at}T12:00:00`), 'd MMM yyyy'),
        kg: Number(c.weight),
        energy: c.energy_level,
      }))
  }, [recentCheckIns])

  const weightsNewest = useMemo(() => rows.map((r) => r.kg), [rows])

  const caution = useMemo(
    () => coachCheckinNutritionCaution(weightsNewest, nutritionWeeklyAvgPct),
    [weightsNewest, nutritionWeeklyAvgPct]
  )

  return (
    <GlassCard className="border-border/40 p-4 dark:border-white/10">
      <div className="mb-3 flex items-center gap-2">
        <Scale className="h-4 w-4 text-sky-500" aria-hidden />
        <h3 className="text-xs font-black uppercase tracking-widest text-foreground">Check-in y nutrición</h3>
        <Apple className="ml-auto h-4 w-4 text-emerald-500/80" aria-hidden />
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        Cruzamos el peso declarado en check-in con la adherencia a comidas de esta semana (~{Math.round(nutritionWeeklyAvgPct)}%).
        Los datos son autodeclarados por el alumno.
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Aún no hay check-ins con peso registrado.</p>
      ) : (
        <ul className="space-y-1.5 border-t border-border/40 pt-3 dark:border-white/10">
          {rows.map((r) => (
            <li key={r.at} className="flex justify-between gap-3 text-[11px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-bold tabular-nums text-foreground">{r.kg.toFixed(1)} kg</span>
            </li>
          ))}
        </ul>
      )}
      {caution ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-950 dark:text-amber-50">
          {caution}
        </p>
      ) : null}
    </GlassCard>
  )
}
