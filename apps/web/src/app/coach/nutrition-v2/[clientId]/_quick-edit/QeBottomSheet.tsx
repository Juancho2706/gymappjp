'use client'

/**
 * Bottom sheet compartido de los menus "..." del modo edicion (dia y franja). Se usa Sheet
 * (z-[71]) y NO DropdownMenu a proposito: el overlay del quick-edit vive en z-[60] y el popup
 * del menu se posiciona en z-50, asi que el sheet es la unica superficie que queda POR ENCIMA
 * sin pelear con el stacking del overlay (ademas de ser la afordancia tactil correcta).
 *
 * Vive en su propio archivo (y no dentro de QuickEditPlanView) para que la franja
 * (EditableSlotCard) lo reuse sin crear un ciclo de imports entre ambos modulos.
 */

import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export function QeBottomSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-card bg-surface-card text-body dark:bg-surface-card">
        <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
          <SheetTitle className="pr-10 font-display text-lg font-semibold normal-case tracking-tight text-strong">
            {title}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
