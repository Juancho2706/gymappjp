'use client'

/**
 * Confirmacion de salida del modo edicion con cambios sin publicar. Reemplaza los
 * `window.confirm()` nativos (cuadro del sistema operativo, sin tokens ni dark mode) por el
 * Dialog del DS, igual que StaleBaseDialog: z-[71] queda por ENCIMA del overlay del
 * quick-edit (z-[60]) y de la barra de publicar (z-[65]).
 *
 * Dos intenciones sobre la misma superficie: "leave" (X del header) y "discard" ("Descartar"
 * de la barra de publicar). Escape y click afuera equivalen a "Seguir editando" (accion segura).
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QE_COPY } from './microcopy'

export type QuickEditExitIntent = 'leave' | 'discard'

/**
 * El CUERPO y los CTA salen tal cual de `QE_COPY` (los mismos textos que mostraba el
 * window.confirm, sin cambio de copy). Los dos TITULOS son lo unico nuevo y espejan verbatim
 * los del quick-edit de RN (`apps/mobile/.../quick-edit/microcopy.ts`: `leaveGuardTitle` y
 * `discardTitle`), que ya resuelve este mismo guard con un Alert nativo.
 */
const EXIT_COPY: Record<
  QuickEditExitIntent,
  { title: string; body: (changeCount: number) => string; cta: string }
> = {
  leave: {
    title: '¿Salir del modo edición?',
    body: () => QE_COPY.leaveGuard,
    cta: 'Salir',
  },
  discard: {
    title: '¿Descartar los cambios?',
    body: (changeCount) => QE_COPY.discardConfirm(changeCount),
    cta: QE_COPY.discard,
  },
}

export function ExitConfirmDialog({
  open,
  intent,
  changeCount,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /**
   * Que guard disparo el dialogo. El padre lo mantiene aunque cierre (solo cambia `open`),
   * para que el copy no salte a la otra variante durante la animacion de cierre.
   */
  intent: QuickEditExitIntent
  changeCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  const copy = EXIT_COPY[intent]

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">{copy.title}</DialogTitle>
          <DialogDescription>{copy.body(changeCount)}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* "Seguir editando" va PRIMERO en el DOM (recibe el foco inicial del dialogo);
              `flex-col-reverse` del footer lo baja visualmente en movil. */}
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            {QE_COPY.keepEditing}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-rose-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
          >
            {copy.cta}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
