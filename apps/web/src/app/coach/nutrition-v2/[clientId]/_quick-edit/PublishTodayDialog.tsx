'use client'

/**
 * Diálogo previo a publicar cuando el alumno YA registró algo hoy (tren «Cantidades honestas», SPEC §6.2,
 * mockup M3, decisión D5 a del owner: «Aplicar hoy» por defecto).
 *
 * Por qué existe: republicar el mismo día rearma el snapshot de hoy con ids nuevos; con el linaje de W3.1
 * lo que el alumno registró sobre ítems que no cambiaron sigue «Registrado», pero el coach tiene que
 * saberlo ANTES de tocar el día del alumno. «Aplicar desde mañana» deja la versión vigente intacta hoy:
 * cero fantasmas por construcción. Solo se abre con registros hoy; el padre decide (ver `PublishBar`).
 *
 * Mismo molde que `ExitConfirmDialog` (Dialog del DS por encima del overlay del quick-edit); copy espejo
 * verbatim de `PublishTodaySheet` en RN. Escape y click afuera = seguir editando (acción segura).
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type PublishEffectiveFromChoice = 'today' | 'tomorrow'

export const PUBLISH_TODAY_COPY = {
  title: (slotCount: number, entryCount: number) =>
    slotCount > 0
      ? `Tu alumno ya registró ${slotCount} ${slotCount === 1 ? 'comida' : 'comidas'} hoy`
      : `Tu alumno ya registró ${entryCount} ${entryCount === 1 ? 'alimento' : 'alimentos'} hoy`,
  body: 'Lo que ya registró se conserva. Los ítems que no cambiaste siguen marcados como registrados.',
  applyToday: 'Aplicar hoy',
  applyTomorrow: 'Aplicar desde mañana',
} as const

export function PublishTodayDialog({
  open,
  pending,
  slotCount,
  entryCount,
  onChoose,
  onCancel,
}: {
  open: boolean
  pending: boolean
  /** Franjas con al menos un registro activo hoy (manda en el copy si > 0). */
  slotCount: number
  /** Registros activos hoy (respaldo del copy cuando no hay franja, p. ej. solo «Fuera del plan»). */
  entryCount: number
  onChoose: (choice: PublishEffectiveFromChoice) => void
  /** Cerrar = seguir editando; nada se publica. */
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">
            {PUBLISH_TODAY_COPY.title(slotCount, entryCount)}
          </DialogTitle>
          <DialogDescription>{PUBLISH_TODAY_COPY.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* «Aplicar desde mañana» va PRIMERO en el DOM (foco inicial = la opción conservadora);
              `flex-col-reverse` del footer deja «Aplicar hoy» abajo y a la derecha, como CTA primario. */}
          <button
            type="button"
            onClick={() => onChoose('tomorrow')}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-auto"
          >
            {PUBLISH_TODAY_COPY.applyTomorrow}
          </button>
          <button
            type="button"
            onClick={() => onChoose('today')}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-auto"
          >
            {PUBLISH_TODAY_COPY.applyToday}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
