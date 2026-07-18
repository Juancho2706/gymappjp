'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { archivePlanAction } from '../_actions/nutrition-archive.actions'

// "Archivar plan vigente" (web coach). Boton secundario DISCRETO (zona inferior de la ficha V2,
// lejos del CTA primario) que abre un dialogo de confirmacion claro y no toxico: el alumno deja
// de ver el plan, pero el historial se conserva. Al confirmar corre `archivePlanAction` y refresca
// la ficha (que pasa a "Sin plan vigente"). La barrera real es server-side; esta UI solo espeja.
// El Dialog de Base UI ya maneja Escape y trampa de foco; guardamos onOpenChange mientras corre.

export function ArchivePlanButton({
  clientId,
  planId,
  planName,
}: {
  clientId: string
  planId: string
  planName: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    if (isPending) return
    if (next) setError(null)
    setOpen(next)
  }

  function handleConfirm() {
    if (isPending) return
    setError(null)
    startTransition(async () => {
      const res = await archivePlanAction({ clientId, planId })
      if (res.ok) {
        setOpen(false)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-subtle bg-surface-card px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
      >
        <Archive className="h-4 w-4" />
        Archivar plan
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="normal-case tracking-tight">Archivar plan vigente</DialogTitle>
            <DialogDescription>
              El alumno dejara de ver{' '}
              <span className="font-semibold text-strong">{planName}</span>. El historial registrado
              se conserva. Puedes crear uno nuevo cuando quieras.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p
              role="alert"
              className="rounded-control border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {isPending ? 'Archivando…' : 'Archivar plan'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
