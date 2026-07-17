'use client'

/**
 * Entrada al modo edicion desde la ficha (§1.2.A): CTA primaria "Editar plan" (lapiz) +
 * menu "..." con el camino secundario "Rehacer con el asistente" (wizard actual).
 * Al editar monta el provider + overlay in-place (misma ruta, estado cliente editing=true).
 * Al salir se desmonta: reabrir re-hidrata desde el read model fresco (router.refresh()).
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Pencil, Wand2 } from 'lucide-react'
import type { NutritionPlanReadModel } from '@eva/nutrition-v2'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { QuickEditProvider } from './QuickEditProvider'
import { QuickEditPlanView } from './QuickEditPlanView'
import { QE_COPY } from './microcopy'

export function QuickEditEntry({
  clientId,
  clientName,
  planModel,
  today,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  today: string
}) {
  const [editing, setEditing] = useState(false)

  // Overlay abierto → sin scroll del body (la ficha queda debajo, intacta).
  useEffect(() => {
    if (!editing) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [editing])

  if (planModel.plan === null) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-primary/100 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:gap-2 md:px-4"
      >
        <Pencil className="h-4 w-4" />
        {QE_COPY.enter}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Más opciones del plan"
          className="h-11 w-11 shrink-0 rounded-control border border-border-subtle bg-surface-card p-0 normal-case tracking-normal text-muted hover:bg-surface-sunken hover:text-strong dark:bg-surface-card"
        >
          <MoreVertical aria-hidden="true" className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            render={<Link href={`/coach/nutrition-v2/${clientId}/builder`} />}
          >
            <Wand2 aria-hidden="true" className="h-4 w-4" />
            {QE_COPY.redo}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing ? (
        <QuickEditProvider
          clientId={clientId}
          clientName={clientName}
          planModel={planModel}
          today={today}
          onExit={() => setEditing(false)}
        >
          <QuickEditPlanView />
        </QuickEditProvider>
      ) : null}
    </>
  )
}
