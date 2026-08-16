'use client'

/**
 * Superficie modal compartida del modo edicion (menus de dia y franja, renombrar, cambiar
 * dia, copiar franja, agregar grupo, buscar alimento, confirmar publicacion).
 *
 * MOVIL: bottom sheet. Se usa Sheet (z-[71]) y NO DropdownMenu a proposito: el overlay del
 * quick-edit vive en z-[60] y el popup del menu se posiciona en z-50, asi que el sheet es la
 * unica superficie que queda POR ENCIMA sin pelear con el stacking del overlay (ademas de ser
 * la afordancia tactil correcta).
 *
 * DESKTOP (md+): dialogo CENTRADO. Un bottom sheet a todo el ancho de un monitor obliga al
 * coach a cruzar la pantalla entera para leer tres opciones (queja del CEO 08-04). El split
 * se decide con `useIsDesktopMd` — el MISMO hook del creador (`AddDayPopover`,
 * `PortionsGroupPicker`), que ya viaja en este bundle — y no con clases `md:` sobre el sheet:
 * el `SheetContent` ancla su posicion con variantes `data-[side=bottom]:*` y sobreescribirlas
 * por CSS depende del orden de generacion de Tailwind, mientras que Dialog ya trae el
 * posicionamiento centrado, el foco y el mismo z-index (z-[70]/z-[71]) resueltos.
 *
 * Vive en su propio archivo (y no dentro de QuickEditPlanView) para que la franja
 * (EditableSlotCard) lo reuse sin crear un ciclo de imports entre ambos modulos.
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsDesktopMd } from '@/app/coach/nutrition-v2/_components/AddDayPopover'

/** Ancho del dialogo en desktop: `md` para menus y formularios; `lg` para listas y buscadores. */
export type QeSheetSize = 'md' | 'lg'

const DESKTOP_WIDTH: Record<QeSheetSize, string> = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
}

const titleClass = 'font-display text-base font-semibold normal-case tracking-tight text-strong'

export function QeBottomSheet({
  open,
  onOpenChange,
  title,
  size = 'md',
  bodyClassName,
  showCloseButton = true,
  busy = false,
  children,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
  title: string
  /** Ancho en desktop (en movil siempre es el sheet a lo ancho). */
  size?: QeSheetSize
  /** Ajustes del cuerpo scrolleable (padding o espaciado propio de cada contenido). */
  bodyClassName?: string
  /** Se apaga mientras hay una operacion en curso que no se debe interrumpir. */
  showCloseButton?: boolean
  /** Operacion en curso: expone `aria-busy` en la superficie. */
  busy?: boolean
  children: ReactNode
}) {
  const isDesktop = useIsDesktopMd()

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={showCloseButton}
          aria-busy={busy}
          className={cn(
            'overflow-hidden rounded-card border-border-default bg-surface-card p-0 text-body dark:bg-surface-card',
            DESKTOP_WIDTH[size],
          )}
        >
          {/* El alto lo pone ESTE contenedor (no el popup): asi el cuerpo scrollea adentro y
              el dialogo nunca se sale de la ventana con listas largas. */}
          <div className="flex max-h-[80vh] flex-col">
            <div className="shrink-0 border-b border-border-subtle px-5 py-3.5 pr-14">
              <DialogTitle className={titleClass}>{title}</DialogTitle>
            </div>
            <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto p-5', bodyClassName)}>{children}</div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={showCloseButton}
        aria-busy={busy}
        className="max-h-[85dvh] rounded-t-card bg-surface-card text-body dark:bg-surface-card"
      >
        <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
          <SheetTitle className={cn(titleClass, 'pr-10 text-lg')}>{title}</SheetTitle>
        </SheetHeader>
        <div
          className={cn(
            'min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]',
            bodyClassName,
          )}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
