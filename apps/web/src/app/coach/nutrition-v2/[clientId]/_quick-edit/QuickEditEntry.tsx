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
import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
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
  itemSubstitutions,
  today,
}: {
  clientId: string
  clientName: string
  planModel: NutritionPlanReadModel
  /** Reemplazos autorizados de la version base (F-02), fetcheados server-side para el carry-over. */
  itemSubstitutions: NutritionItemSubstitutionRead[]
  today: string
}) {
  const [editing, setEditing] = useState(false)

  // Overlay abierto → sin scroll del body (la ficha queda debajo, intacta).
  // Además marca el <body> con `eva-quickedit-open` para ocultar por CSS la cápsula flotante
  // del nav del coach mientras se edita (mismo bug de apilamiento ya resuelto en el alumno con
  // `eva-v2-sheet-open`; ver globals.css y TodayModal.tsx). Acá solo puede haber UNA instancia de
  // quick-edit por página, así que basta un add/remove simple sin contador de referencias.
  useEffect(() => {
    if (!editing) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('eva-quickedit-open')
    return () => {
      document.body.style.overflow = previous
      document.body.classList.remove('eva-quickedit-open')
    }
  }, [editing])

  if (planModel.plan === null) return null

  return (
    <>
      {/* Icono solo (pedido CEO 2026-07-17): el lapiz basta; el label vive en aria/title. */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={QE_COPY.enter}
        title={QE_COPY.enter}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-primary text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Pencil className="h-[18px] w-[18px]" />
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
          itemSubstitutions={itemSubstitutions}
          today={today}
          onExit={() => setEditing(false)}
        >
          <QuickEditPlanView />
        </QuickEditProvider>
      ) : null}
    </>
  )
}
