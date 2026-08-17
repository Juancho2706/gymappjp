'use client'

import type { ReactNode } from 'react'
import { MacroSpark, MacroSparkPopover } from '@/components/nutrition-v2'

/**
 * HARNESS LOCAL (solo dev) — stories de MacroSpark / MacroSparkPopover (T3.v Cabina V0.4).
 *
 * Vista aislada (`?stories=1`, ver page.tsx) para que Playwright headless golpee el contrato
 * D3 (SPEC) — hover, tap emulado, Esc, "un solo popover abierto" — sin la maraña de sheets y
 * drag-and-drop del editor real. Monta los 3 tamaños del spark puro (V0.2) y las 5 variantes
 * del popover que pide PLAN §2 / TASKS V0.3: macros normales, con fibra, con % de la meta,
 * por 100 g y sin macros.
 *
 * `data-testid` en cada fila: son los anclas que usa `scripts/cabina-visual-check.mjs` — no
 * renombrar sin actualizar el script.
 */
export function MacroSparkStories() {
  return (
    <div className="flex min-h-dvh flex-col gap-8 bg-surface-app p-6 text-body">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          T3.v Cabina · V0.4 · harness
        </p>
        <h1 className="text-xl font-bold text-strong">MacroSpark — stories</h1>
        <p className="max-w-prose text-sm text-muted">
          Muestras aisladas del spark y su popover de gramos (contrato D3). No hay editor
          montado en esta vista: es solo para verificar interacción y responsive en local.
        </p>
      </header>

      <section aria-labelledby="story-sizes-heading" className="flex flex-col gap-3">
        <h2 id="story-sizes-heading" className="text-sm font-semibold text-strong">
          Tamaños (sm / md / lg)
        </h2>
        <div className="flex flex-wrap items-start gap-4">
          <StoryRow label="sm" testId="story-spark-sm">
            <MacroSpark size="sm" calories={210} proteinG={39.3} carbsG={0} fatsG={4.7} />
          </StoryRow>
          <StoryRow label="md (defecto)" testId="story-spark-md">
            <MacroSpark size="md" calories={241} proteinG={7.8} carbsG={39.6} fatsG={4.8} />
          </StoryRow>
          <StoryRow label="lg" testId="story-spark-lg">
            <MacroSpark size="lg" calories={2020} proteinG={148} carbsG={174} fatsG={62} />
          </StoryRow>
        </div>
      </section>

      <section aria-labelledby="story-popover-heading" className="flex flex-col gap-3">
        <h2 id="story-popover-heading" className="text-sm font-semibold text-strong">
          Popover de gramos (D3)
        </h2>
        <div className="flex max-w-md flex-col gap-3">
          <StoryRow label="Macros normales" testId="story-popover-normal">
            <MacroSparkPopover
              calories={241}
              proteinG={7.8}
              carbsG={39.6}
              fatsG={4.8}
              ariaContext="Avena tradicional"
            />
          </StoryRow>
          <StoryRow label="Con fibra" testId="story-popover-fiber">
            <MacroSparkPopover
              calories={253}
              proteinG={5.3}
              carbsG={45.2}
              fatsG={1.9}
              fiberG={6}
              ariaContext="Arroz integral"
            />
          </StoryRow>
          <StoryRow label="Con meta (% del día)" testId="story-popover-target">
            <MacroSparkPopover
              calories={550}
              proteinG={38}
              carbsG={62}
              fatsG={14}
              targetCalories={2200}
              ariaContext="Almuerzo"
            />
          </StoryRow>
          <StoryRow label="Por 100 g" testId="story-popover-per100">
            <MacroSparkPopover
              calories={360}
              proteinG={7}
              carbsG={76}
              fatsG={2.5}
              per100
              ariaContext="Arroz integral"
            />
          </StoryRow>
          <StoryRow label="Sin macros" testId="story-popover-empty">
            <MacroSparkPopover calories={0} proteinG={null} carbsG={null} fatsG={null} ariaContext="Café negro" />
          </StoryRow>
        </div>
      </section>
    </div>
  )
}

function StoryRow({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-1.5 rounded-control border border-border-subtle bg-surface-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="text-xs font-semibold text-muted sm:w-36 sm:shrink-0">{label}</span>
      {children}
    </div>
  )
}
