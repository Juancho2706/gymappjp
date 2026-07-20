'use client'

/**
 * Vista del modo edicion in-place (§1.2.B): overlay a pantalla completa sobre la ficha
 * (misma ruta, estado cliente). Movil-first: header compacto sticky, cards editables,
 * barra de publicacion en la thumb-zone. Plan flexible sin franjas → SOLO la card de
 * metas (targets-only, F1 #6). Estrategia, notas y permisos quedan read-only con hint
 * (F1 §1.2.B.4). Light/dark y white-label via tokens del DS.
 */

import { useState } from 'react'
import { History, Info, LockKeyhole, Plus, X } from 'lucide-react'
import { StrategyBadge } from '@/components/nutrition-v2'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useQuickEdit, genQuickEditKey } from './QuickEditProvider'
import { EditableSlotCard } from './EditableSlotCard'
import { TargetsEditorCard } from './TargetsEditorCard'
import { PublishBar } from './PublishBar'
import { PublishConfirmSheet } from './PublishConfirmSheet'
import { StaleBaseDialog } from './StaleBaseDialog'
import { QE_COPY } from './microcopy'

export function QuickEditPlanView() {
  const {
    state,
    clientName,
    strategy,
    visibleNotes,
    protocolNotes,
    permissions,
    isPending,
    requestExit,
    pendingRestore,
    restoreDraft,
    dismissRestore,
  } = useQuickEdit()
  const usesSlots = strategy === 'structured' || strategy === 'hybrid'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${QE_COPY.enter} de ${clientName}`}
      aria-busy={isPending}
      className="fixed inset-0 z-[60] overflow-y-auto bg-surface-app"
    >
      {/* Header compacto sticky: salir + titulo. */}
      <header className="sticky top-0 z-10 border-b border-border-subtle bg-surface-app/95 backdrop-blur supports-[backdrop-filter]:bg-surface-app/85">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-1.5 px-3 py-2 pt-[max(env(safe-area-inset-top,0px),0.5rem)]">
          <button
            type="button"
            aria-label="Salir del modo edición"
            onClick={requestExit}
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-strong transition-colors hover:bg-surface-card active:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-primary">
              {QE_COPY.enter}
            </p>
            <h1 className="truncate font-display text-lg font-bold leading-tight tracking-[-0.02em] text-strong">
              {clientName}
            </h1>
          </div>
          <div className="shrink-0">
            <StrategyBadge strategy={strategy} compact />
          </div>
        </div>
      </header>

      <div className={'mx-auto w-full max-w-3xl space-y-4 px-3 py-4 ' + (isPending ? 'pointer-events-none opacity-70' : '')}>
        {/* Respaldo local: hay un borrador de una sesion anterior (mismo plan/version) sin publicar. */}
        {pendingRestore ? (
          <div className="animate-in slide-in-from-top-1 rounded-card border border-primary/25 bg-primary/10 p-3">
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              <History aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
              <p className="flex-1 text-xs font-semibold leading-5 text-primary">{QE_COPY.restoreBanner}</p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="inline-flex h-8 items-center justify-center rounded-control bg-primary/100 px-3 text-xs font-bold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {QE_COPY.restoreCta}
                </button>
                <button
                  type="button"
                  onClick={dismissRestore}
                  aria-label={QE_COPY.restoreDismiss}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {state.variants.map((variant) => (
          <section key={variant.key} className="space-y-4">
            {state.variants.length > 1 ? (
              <h2 className="font-display text-base font-semibold text-strong">{variant.label}</h2>
            ) : null}
            <TargetsEditorCard variant={variant} />
            {usesSlots || variant.slots.length > 0 ? (
              <>
                {variant.slots.map((slot, index) => (
                  <EditableSlotCard key={slot.key} variantKey={variant.key} slot={slot} index={index} />
                ))}
                <AddSlotButton variantKey={variant.key} />
              </>
            ) : (
              <p className="flex items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-body">
                <Info aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-muted" />
                {QE_COPY.flexibleTargetsOnly}
              </p>
            )}
          </section>
        ))}

        {/* Fuera de alcance en modo edicion (F1): notas y permisos en read-only con hint. */}
        <section className="rounded-card border border-border-subtle bg-surface-card p-4">
          <div className="flex items-center gap-2">
            <LockKeyhole aria-hidden="true" className="h-4 w-4 text-muted" />
            <h2 className="font-display text-base font-semibold text-strong">Notas y permisos</h2>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-body">
            {visibleNotes || 'Sin indicaciones visibles.'}
          </p>
          {protocolNotes ? (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted">{protocolNotes}</p>
          ) : null}
          <ul className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {(
              [
                [permissions.canRegisterFreely, 'Registro libre'],
                [permissions.canAdjustPrescribedQuantity, 'Ajusta cantidades'],
                [permissions.canSubstitute, 'Puede sustituir'],
              ] as const
            ).map(([enabled, label]) => (
              <li
                key={label}
                className={
                  'rounded-pill border px-2 py-0.5 ' +
                  (enabled
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border-subtle bg-surface-sunken text-muted')
                }
              >
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted">
            <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {QE_COPY.readonlyHint}
          </p>
        </section>

        {/* Espacio para que la barra sticky no tape la ultima card. */}
        <div aria-hidden="true" className="h-24" />
      </div>

      <PublishBar />
      <PublishConfirmSheet />
      <StaleBaseDialog />
    </div>
  )
}

/** "+ Agregar franja" (§1.2.B.2): nombre + hora en un bottom sheet. */
function AddSlotButton({ variantKey }: { variantKey: string }) {
  const { dispatch, isPending } = useQuickEdit()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('')

  function handleOpenChange(next: boolean) {
    if (next) {
      setName('')
      setStartTime('')
    }
    setOpen(next)
  }

  function handleAdd() {
    if (name.trim().length === 0) return
    dispatch({ type: 'ADD_SLOT', variantKey, key: genQuickEditKey(), name: name.trim(), startTime })
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleOpenChange(true)}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="h-4 w-4" />
        {QE_COPY.addSlot}
      </button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-card bg-surface-card text-body dark:bg-surface-card">
          <SheetHeader className="border-border-subtle bg-transparent p-4 pb-2 dark:border-border-subtle">
            <SheetTitle className="pr-10 font-display text-lg font-semibold normal-case tracking-tight text-strong">
              {QE_COPY.addSlot}
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-[max(env(safe-area-inset-bottom,0px),1rem)]">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="qe-new-slot-name">
                Nombre de la franja
              </label>
              <input
                id="qe-new-slot-name"
                value={name}
                placeholder="Colación, Cena..."
                onChange={(event) => setName(event.target.value)}
                className="min-h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-base text-strong outline-none transition-colors placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/25 md:text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="qe-new-slot-time">
                Hora (opcional)
              </label>
              <input
                id="qe-new-slot-time"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                className="h-11 w-full rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold tabular-nums text-strong outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={name.trim().length === 0}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary/100 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {QE_COPY.addSlot}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
