'use client'

import { AlertTriangle, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NutritionCoachAlert } from '@/lib/nutrition-coach-alerts'

const iconByVariant = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const

export function NutritionCoachAlertsPanel({ alerts }: { alerts: NutritionCoachAlert[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2 rounded-2xl border border-border/60 bg-muted/10 p-4 dark:border-white/10">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground">Alertas del coach</h3>
      </div>
      <ul className="space-y-2">
        {alerts.map((a) => {
          const Icon = iconByVariant[a.variant]
          return (
            <li
              key={a.id}
              className={cn(
                'flex gap-2 rounded-xl border px-3 py-2.5 text-xs leading-snug',
                a.variant === 'danger' &&
                  'border-rose-500/35 bg-rose-500/10 text-rose-950 dark:text-rose-50',
                a.variant === 'warning' &&
                  'border-amber-500/35 bg-amber-500/10 text-amber-950 dark:text-amber-50',
                a.variant === 'info' && 'border-sky-500/30 bg-sky-500/10 text-sky-950 dark:text-sky-50'
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" aria-hidden />
              <div className="min-w-0">
                <p className="font-bold">{a.title}</p>
                <p className="mt-0.5 text-[11px] opacity-90">{a.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
