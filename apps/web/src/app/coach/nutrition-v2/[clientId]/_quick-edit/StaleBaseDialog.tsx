'use client'

/**
 * Conflicto STALE_BASE / EFFECTIVE_DATE (§1.2.D): otra pestana/RN publico entre medio.
 * Unica salida segura en F1: recargar (los cambios de esta pantalla se pierden).
 * Merge asistido = F2.
 */

import { RefreshCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useQuickEdit } from './QuickEditProvider'
import { QE_COPY } from './microcopy'

export function StaleBaseDialog() {
  const { staleOpen, reloadAfterStale } = useQuickEdit()

  return (
    <Dialog open={staleOpen} onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="normal-case tracking-tight">El plan cambió en otra sesión</DialogTitle>
          <DialogDescription>{QE_COPY.stale}</DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={reloadAfterStale}
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <RefreshCcw className="h-4 w-4" />
          {QE_COPY.reload}
        </button>
      </DialogContent>
    </Dialog>
  )
}
