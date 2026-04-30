'use client'

import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'

export function EmptyNutritionState({ coachSlug }: { coachSlug: string }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="px-4 py-3.5 pt-safe flex items-center gap-3 border-b border-border/10">
        <Link
          href={`/c/${coachSlug}/dashboard`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-black inline-flex flex-wrap items-center gap-1.5">
          Plan Nutricional
          <InfoTooltip
            title="Sin plan activo"
            content="Aquí verás comidas, metas y adherencia cuando tu coach te asigne un plan nutricional activo en EVA. Si crees que deberías tener uno, escribe a tu coach."
          />
        </h1>
      </header>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center gap-4">
        <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center">
          <Apple className="w-10 h-10 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground">Sin plan asignado</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            Tu coach aún no te ha asignado un plan nutricional. Consulta con él para comenzar.
          </p>
        </div>
      </div>
    </div>
  )
}
