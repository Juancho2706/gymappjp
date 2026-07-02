'use client'

import { AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NutritionCoachAlert } from '@/lib/nutrition-coach-alerts'

const iconByVariant = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const

const toneByVariant = {
  danger: { border: 'var(--danger-500)', bg: 'var(--danger-100)', text: 'text-[var(--danger-700)]', icon: 'text-[var(--danger-600)]' },
  warning: { border: 'var(--warning-500)', bg: 'var(--warning-100)', text: 'text-[var(--warning-700)]', icon: 'text-[var(--warning-600)]' },
  info: { border: 'var(--sport-500)', bg: 'var(--sport-100)', text: 'text-[var(--sport-700)]', icon: 'text-[var(--sport-600)]' },
} as const

export function NutritionCoachAlertsPanel({ alerts }: { alerts: NutritionCoachAlert[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {alerts.map((a) => {
          const Icon = iconByVariant[a.variant]
          const tone = toneByVariant[a.variant]
          return (
            <li
              key={a.id}
              className="flex gap-2.5 rounded-control border-l-[3px] px-3 py-2.5 text-xs leading-snug"
              style={{ borderLeftColor: tone.border, background: tone.bg }}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.icon)} aria-hidden />
              <div className="min-w-0">
                <p className={cn('font-bold', tone.text)}>{a.title}</p>
                <p className="mt-0.5 text-[11px] text-muted">{a.description}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
