'use client'

/**
 * Bottom sheet de confirmacion de publicacion (§1.2.C): explica desde cuando aplican
 * los cambios y que lo ya registrado hoy no se toca. CTA "Publicar ahora" con spinner
 * y controles congelados durante el publish (aria-busy).
 */

import { Check, Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useQuickEdit } from './QuickEditProvider'
import { QE_COPY } from './microcopy'

export function PublishConfirmSheet() {
  const { confirmOpen, closeConfirm, publishNow, isPending, clientName, futureDateLabel, changeCount } = useQuickEdit()

  return (
    <Sheet open={confirmOpen} onOpenChange={(next) => (!next ? closeConfirm() : undefined)}>
      <SheetContent
        side="bottom"
        showCloseButton={!isPending}
        aria-busy={isPending}
        className="rounded-t-card bg-surface-card text-body dark:bg-surface-card"
      >
        <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
          <SheetTitle className="pr-10 font-display text-lg font-semibold normal-case tracking-tight text-strong">
            {QE_COPY.confirmTitle}
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
          <p className="text-sm leading-6 text-body">{QE_COPY.confirmBody(clientName, futureDateLabel)}</p>
          <p className="mt-2 text-xs text-muted">{QE_COPY.dirtyBar(changeCount)}</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={publishNow}
              disabled={isPending}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isPending ? 'Publicando…' : QE_COPY.confirmCta}
            </button>
            <button
              type="button"
              onClick={closeConfirm}
              disabled={isPending}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {QE_COPY.keepEditing}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
