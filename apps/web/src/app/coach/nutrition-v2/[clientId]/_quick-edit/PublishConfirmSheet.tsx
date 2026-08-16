'use client'

/**
 * Confirmacion de publicacion (§1.2.C): explica desde cuando aplican los cambios y que lo
 * ya registrado hoy no se toca. CTA "Publicar ahora" con spinner y controles congelados
 * durante el publish (aria-busy). Sheet en movil / dialogo centrado en desktop, igual que el
 * resto de las superficies del modo edicion (`QeBottomSheet`).
 */

import { Check, Loader2 } from 'lucide-react'
import { useQuickEdit } from './QuickEditProvider'
import { QeBottomSheet } from './QeBottomSheet'
import { QE_COPY, formatIsoDateDdMmYyyy } from './microcopy'

export function PublishConfirmSheet() {
  const {
    confirmOpen,
    closeConfirm,
    publishNow,
    isPending,
    clientName,
    futureDateLabel,
    changeCount,
    surface,
    state,
  } = useQuickEdit()

  // Modo plantilla (T3.2b): guardar, no publicar — nada le llega a ningun alumno.
  const isTemplate = surface === 'template'
  // Creacion: no hay version previa, asi que el copy habla del plan, no de "los cambios".
  const isCreation = state.meta?.effectiveFrom !== undefined
  const effectiveLabel = state.meta?.effectiveFrom
    ? formatIsoDateDdMmYyyy(state.meta.effectiveFrom)
    : null

  return (
    <QeBottomSheet
      open={confirmOpen}
      onOpenChange={(next) => (!next ? closeConfirm() : undefined)}
      title={
        isTemplate
          ? QE_COPY.templateConfirmTitle
          : isCreation
            ? QE_COPY.createConfirmTitle
            : QE_COPY.confirmTitle
      }
      showCloseButton={!isPending}
      busy={isPending}
      bodyClassName="space-y-0"
    >
      <p className="text-sm leading-6 text-body">
        {isTemplate
          ? QE_COPY.templateConfirmBody
          : isCreation
            ? QE_COPY.createConfirmBody(clientName, effectiveLabel)
            : QE_COPY.confirmBody(clientName, futureDateLabel)}
      </p>
      <p className="mt-2 text-xs text-muted">
        {isTemplate ? QE_COPY.templateDirtyBar(changeCount) : QE_COPY.dirtyBar(changeCount)}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={publishNow}
          disabled={isPending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isPending
            ? isTemplate
              ? QE_COPY.templateSaving
              : 'Publicando…'
            : isTemplate
              ? QE_COPY.templateConfirmCta
              : QE_COPY.confirmCta}
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
    </QeBottomSheet>
  )
}
