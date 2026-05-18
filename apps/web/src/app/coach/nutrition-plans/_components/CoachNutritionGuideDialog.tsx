'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { COACH_NUTRITION_ONBOARDING_STEPS } from './nutrition-onboarding-shared'

type Props = {
  hasClients: boolean
  onAssign?: () => void
  triggerLabel?: string
}

export function CoachNutritionGuideDialog({ hasClients, onAssign, triggerLabel = 'Guía rápida' }: Props) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            {triggerLabel}
          </button>
        }
      />
      <DialogContent className="sm:max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-black uppercase tracking-tight">Guía rápida — Nutrición</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tres pasos para sacar provecho al módulo. Puedes volver aquí cuando quieras.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 pt-2 max-h-[65vh] overflow-y-auto pr-1">
          {COACH_NUTRITION_ONBOARDING_STEPS.map((step) => {
            const Icon = step.icon
            const isDisabled = step.number === 3 && !hasClients
            return (
              <div
                key={step.number}
                className={cn(
                  'relative rounded-xl border p-4 space-y-3',
                  isDisabled ? 'border-border/40 bg-muted/20 opacity-50' : 'border-border bg-muted/10'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black',
                      step.iconBg,
                      step.iconColor
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Paso {step.number}
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-foreground">{step.title}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{step.description}</p>
                </div>
                {step.number === 3 ? (
                  <button
                    type="button"
                    disabled={isDisabled || !onAssign}
                    onClick={onAssign}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-bold',
                      isDisabled || !onAssign
                        ? 'cursor-not-allowed text-muted-foreground'
                        : 'text-sky-600 hover:text-sky-700 dark:text-sky-400'
                    )}
                  >
                    {step.cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <Link
                    href={step.href!}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs font-bold',
                      step.number === 1
                        ? 'text-emerald-600 hover:text-emerald-700 dark:text-emerald-400'
                        : 'text-violet-600 hover:text-violet-700 dark:text-violet-400'
                    )}
                  >
                    {step.cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
        {!hasClients && (
          <p className="text-[10px] text-muted-foreground">Necesitas al menos un alumno para usar “Asignar plan”.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
