'use client'

/**
 * Barra de publicacion sticky inferior (§1.2.C, movil-first, thumb-zone): aparece al
 * primer cambio con "{n} cambios sin publicar" + Descartar / Publicar cambios. En error
 * muestra "No se pudo publicar. Reintentar" (el draft NO se pierde; el reintento reusa la
 * misma clave de idempotencia). Safe-area inset para no chocar con el home indicator.
 */

import Link from 'next/link'
import { AlertTriangle, Loader2, LockKeyhole, RefreshCcw } from 'lucide-react'
import { useQuickEdit } from './QuickEditProvider'
import { QE_COPY } from './microcopy'

// Ruta canonica de upgrade de plan (inlineada: _lib/nutrition-pro.ts es server-only).
// Nutricion Pro viene incluido en los planes pagos — el CTA apunta al cambio de plan.
const NUTRITION_PRO_UPGRADE_HREF = '/coach/subscription'

export function PublishBar() {
  const { changeCount, isPending, publishError, upgradeRequired, openConfirm, retryPublish, discardChanges } =
    useQuickEdit()

  const visible = changeCount > 0 || publishError !== null || upgradeRequired
  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[65] px-3 pb-[max(env(safe-area-inset-bottom,0px),0.75rem)]">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-card border border-border-default bg-surface-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-surface-card/85">
        {upgradeRequired ? (
          <div className="mb-2 flex items-start gap-2 rounded-control border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-body">
            <LockKeyhole aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>
              {QE_COPY.upgradeRequired}{' '}
              <Link href={NUTRITION_PRO_UPGRADE_HREF} className="font-semibold text-primary underline underline-offset-2">
                Mejorar mi plan
              </Link>
            </p>
          </div>
        ) : null}
        {publishError ? (
          <button
            type="button"
            onClick={retryPublish}
            disabled={isPending}
            className="mb-2 flex w-full items-center gap-2 rounded-control border border-rose-300 bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60"
          >
            {publishError === QE_COPY.publishFailed || publishError === QE_COPY.offline ? (
              <RefreshCcw aria-hidden="true" className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            )}
            <span className="min-w-0">{publishError}</span>
          </button>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-strong" aria-live="polite">
            {QE_COPY.dirtyBar(changeCount)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={discardChanges}
              disabled={isPending}
              className="inline-flex min-h-11 items-center rounded-control border border-border-default bg-surface-card px-3.5 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {QE_COPY.discard}
            </button>
            <button
              type="button"
              onClick={openConfirm}
              disabled={isPending || changeCount === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {QE_COPY.publish}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
