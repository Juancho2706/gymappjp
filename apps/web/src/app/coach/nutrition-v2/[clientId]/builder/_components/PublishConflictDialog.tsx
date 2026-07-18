'use client'

import { CalendarClock, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Modal de decision cuando la fecha de vigencia elegida choca con el plan que ya rige hoy
// (mismo patron visual que ArchivePlanButton / AssignPlanToClientsDialog: Dialog de Base UI,
// estados isPending + error inline, botones bloqueados durante la mutacion). La barrera real
// es server-side (el RPC de publicacion); esta UI solo evita el error rojo crudo y ofrece las
// tres salidas: empezar manana, archivar el actual y reemplazar, o cancelar.

const optionButtonClass =
  'flex w-full items-start gap-3 rounded-control border border-border-default bg-surface-card px-3 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export function PublishConflictDialog({
  open,
  planName,
  canReplace,
  isPending,
  error,
  onOpenChange,
  onStartTomorrow,
  onReplaceToday,
}: {
  open: boolean
  planName: string
  canReplace: boolean
  isPending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onStartTomorrow: () => void
  onReplaceToday: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">Ya hay un plan vigente desde hoy</DialogTitle>
          <DialogDescription>
            {planName ? (
              <>
                <span className="font-semibold text-strong">{planName}</span> empieza a regir hoy.
              </>
            ) : (
              'El plan actual empieza a regir hoy.'
            )}{' '}
            Elige cómo seguir con el plan nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 space-y-2.5">
          <button type="button" onClick={onStartTomorrow} disabled={isPending} className={optionButtonClass}>
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-primary" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-strong">Empezar mañana</span>
              <span className="mt-0.5 block text-xs text-muted">
                El plan nuevo entra en vigencia mañana; el de hoy sigue activo hasta entonces.
              </span>
            </span>
          </button>

          {canReplace ? (
            <button type="button" onClick={onReplaceToday} disabled={isPending} className={optionButtonClass}>
              <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-primary" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-strong">Archivar el actual y reemplazar</span>
                <span className="mt-0.5 block text-xs text-muted">
                  El plan de hoy se archiva ahora y este pasa a regir desde hoy. El historial del alumno se conserva.
                </span>
              </span>
            </button>
          ) : null}
        </div>

        {isPending ? (
          <p className="flex items-center gap-2 text-xs text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Procesando…
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
