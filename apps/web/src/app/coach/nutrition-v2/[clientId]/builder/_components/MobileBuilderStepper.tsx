'use client'

import type { NutritionBuilderStepModel } from '@eva/nutrition-v2'

// Stepper compacto para movil (patron "text stepper" de wizards 2026: "Paso X de N" + barra
// segmentada de progreso). Muestra SOLO el paso actual para no empujar el contenido hacia abajo
// en pantallas angostas; la lista completa de pasos vive en BuilderStepList (desktop, lg+).
// Presentacional puro: consume el mismo modelo de pasos que BuilderStepList.
export function MobileBuilderStepper({ steps }: { steps: NutritionBuilderStepModel[] }) {
  const activeIndex = steps.findIndex((s) => s.state === 'current' || s.state === 'error')
  const currentIndex = activeIndex === -1 ? 0 : activeIndex
  const current = steps[currentIndex]
  const next = steps[currentIndex + 1]
  const hasError = current?.state === 'error'
  return (
    <div
      data-testid="nutrition-v2-builder-stepper-mobile"
      aria-label="Progreso del constructor"
      className="rounded-card border border-border-subtle bg-surface-card p-3 lg:hidden"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate font-display text-sm font-semibold text-strong">
          {current?.label}
          {current?.description ? (
            <span className="font-sans text-xs font-normal text-muted"> · {current.description}</span>
          ) : null}
        </p>
        <p className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          Paso {currentIndex + 1} de {steps.length}
        </p>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s.id}
            className={
              'h-1 flex-1 rounded-pill transition-colors ' +
              (i === currentIndex && hasError
                ? 'bg-rose-500'
                : i <= currentIndex
                  ? 'bg-primary/100'
                  : 'bg-border-subtle')
            }
          />
        ))}
      </div>
      {next ? <p className="mt-1.5 truncate text-[11px] text-subtle">Siguiente: {next.label}</p> : null}
    </div>
  )
}
