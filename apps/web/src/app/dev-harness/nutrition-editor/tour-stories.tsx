'use client'

import type { ReactNode } from 'react'
import {
  TourHelpButton,
  TourOverlay,
  clearTourSeen,
  tourSteps,
  useHasSeenTour,
  useTourController,
  useTourWideViewport,
  type TourId,
} from '@/components/nutrition-v2'

/**
 * HARNESS LOCAL (solo dev) — stories de la Guía Viva (`?tour=editor|hub`, ver page.tsx).
 *
 * Monta el motor REAL (`TourOverlay` + `TourHelpButton` + `useTourController`) sobre una maqueta de
 * mentira con los `data-tour` de los guiones cerrados. La maqueta existe para que el posicionador
 * tenga contra qué trabajar SIN levantar el editor entero: acá los targets están puestos a propósito
 * en las cuatro esquinas y uno de ellos vive bajo el pliegue, que es lo que ejercita el flip, el
 * clamp y el `scrollIntoView` de D3.
 *
 * Semántica REAL de la memoria (D4): el auto-arranque respeta el flag `eva.tour.<id>.v1.qa-tour`.
 * Por eso hay un botón «Reiniciar guía» — sin él, la segunda carga de la story no volvería a
 * auto-arrancar y no habría forma de repetir la prueba sin limpiar el `localStorage` a mano. El gate
 * de G2.3 puede entonces verificar las DOS mitades del invariante: sin flag auto-arranca, con flag
 * sembrado no.
 *
 * `data-testid` y `data-tour` son anclas del gate (`scripts/cabina-visual-check.mjs`): no renombrar
 * sin actualizar el script. NO llega a producción: la page hace `notFound()` fuera de development.
 */

const HARNESS_COACH_ID = 'qa-tour'

export function TourStories({ tourId }: { tourId: TourId }) {
  const wide = useTourWideViewport()
  const steps = tourSteps(tourId, !wide)
  const seen = useHasSeenTour(tourId, HARNESS_COACH_ID)
  const tour = useTourController({ tourId, coachId: HARNESS_COACH_ID, autoStart: true })

  return (
    <div className="flex min-h-dvh flex-col bg-surface-app text-body">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
            Guía Viva · harness · {tourId}
          </p>
          <p className="text-xs text-muted">
            {steps.length} pasos · guion {wide ? 'largo (≥768)' : 'corto (<768)'} · flag{' '}
            <span data-testid="tour-story-flag" className="font-mono font-semibold text-strong">
              {seen ? 'marcado' : 'vacío'}
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid="tour-story-reset"
            onClick={() => clearTourSeen(tourId, HARNESS_COACH_ID)}
            className="min-h-9 rounded-control border border-border-default bg-surface-card px-2.5 text-[11px] font-semibold text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reiniciar guía
          </button>
          {/* En el hub el «?» va inline junto al título (D2); acá vive en la cabecera de la story
              para que el paso 6 del guion del hub tenga a quién iluminar. */}
          <TourHelpButton
            tourId={tourId}
            coachId={HARNESS_COACH_ID}
            variant="inline"
            onOpen={tour.start}
          />
        </div>
      </header>

      {tourId === 'editor' ? <EditorMock /> : <HubMock />}

      {/* Montado SIEMPRE y controlado por `active`, que es el patrón que el PLAN §2 le pide a las
          superficies reales. El otro patrón (`{activo && <TourOverlay active/>}`) también funciona:
          la medición depende de `mounted`, ver el efecto de medición del motor. */}
      <TourOverlay steps={steps} active={tour.active} onEnd={tour.end} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * Maqueta del editor — 8 targets del guion largo + el `agregar` del corto
 * ---------------------------------------------------------------------------------------------- */

function EditorMock() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Cinta: ancha y pegada arriba ⇒ la tarjeta tiene que irse ABAJO (no cabe a los costados). */}
      <div
        data-tour="ribbon"
        className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-card px-4 py-3"
      >
        <span className="text-sm font-bold text-strong">2.020 kcal · P 148 · C 174 · G 62</span>
        <MockButton dataTour="metas">Metas del día ▾</MockButton>
      </div>

      <div className="flex flex-1 gap-3 p-3">
        {/* Rail de días: columna angosta a la IZQUIERDA ⇒ la tarjeta va a su derecha. */}
        <aside
          data-tour="rail"
          className="hidden w-[180px] shrink-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-3 lg:flex"
        >
          <span className="text-xs font-semibold text-strong">BASE</span>
          <span className="text-xs text-muted">Sábado</span>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-3">
          <section
            data-tour="slot"
            className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-3"
          >
            <span className="text-sm font-bold text-strong">Desayuno · 08:00</span>
            <div className="flex items-center justify-between gap-2 rounded-control bg-surface-sunken px-3 py-2">
              <span className="text-xs text-body">Avena tradicional · 80 g</span>
              <MockButton dataTour="item-menu">⋮</MockButton>
            </div>
          </section>

          <MockButton dataTour="agregar">+ Agregar alimento</MockButton>

          {/* Relleno alto a propósito: deja «porciones» BAJO EL PLIEGUE, que es lo único que
              ejercita de verdad el `scrollIntoView` del posicionador (D3). */}
          <div aria-hidden="true" className="h-[900px] rounded-card border border-dashed border-border-subtle" />

          <section
            data-tour="porciones"
            className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-3"
          >
            <span className="text-sm font-bold text-strong">Porciones</span>
            <span className="text-xs text-muted">Verduras · 7,5</span>
          </section>
        </main>

        {/* Paleta: columna pegada a la DERECHA ⇒ la tarjeta tiene que hacer FLIP a la izquierda. */}
        <aside
          data-tour="paleta"
          className="hidden w-[260px] shrink-0 flex-col gap-2 rounded-card border border-border-subtle bg-surface-card p-3 xl:flex"
        >
          <span className="text-xs font-semibold text-strong">Sueles usar</span>
          <span className="text-xs text-muted">Arroz integral · Pollo</span>
        </aside>
      </div>

      {/* Barra de publicar: pegada abajo ⇒ la tarjeta tiene que irse ARRIBA. */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-card px-4 py-3">
        <MockButton dataTour="publicar">Publicar cambios</MockButton>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * Maqueta del hub — 5 targets + el «?» de la cabecera (paso 6)
 * ---------------------------------------------------------------------------------------------- */

function HubMock() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <nav data-tour="tabs" role="tablist" className="flex flex-wrap gap-2">
        {['Alumnos', 'Plantillas', 'Porciones', 'Alimentos'].map((tab, index) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={index === 0}
            className="min-h-9 rounded-pill border border-border-subtle bg-surface-card px-3 text-xs font-semibold text-strong"
          >
            {tab}
          </button>
        ))}
      </nav>

      <div data-tour="stats" className="flex flex-wrap gap-3">
        {[
          ['Con plan', '18'],
          ['Sin plan', '4'],
          ['Atención', '2'],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-[104px] flex-col gap-0.5 rounded-card border border-border-subtle bg-surface-card px-3 py-2"
          >
            <span className="text-lg font-bold tabular-nums text-strong">{value}</span>
            <span className="text-[11px] text-muted">{label}</span>
          </div>
        ))}
      </div>

      <div data-tour="filters" className="flex flex-wrap gap-2">
        {['Todos', 'Sin plan', 'Atrasados'].map((filter) => (
          <button
            key={filter}
            type="button"
            className="min-h-9 rounded-pill border border-border-subtle bg-surface-card px-3 text-xs font-semibold text-body"
          >
            {filter}
          </button>
        ))}
      </div>

      <div
        data-tour="alumno-row"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-card p-3"
      >
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-strong">Catalina Rojas</span>
          <div aria-hidden="true" className="flex gap-1">
            {Array.from({ length: 7 }, (_, day) => (
              <span
                key={day}
                className={`size-2 rounded-full ${day < 5 ? 'bg-sport-500' : 'bg-border-default'}`}
              />
            ))}
          </div>
        </div>
        <MockButton dataTour="nueva-version">Nueva versión</MockButton>
      </div>
    </div>
  )
}

function MockButton({ dataTour, children }: { dataTour: string; children: ReactNode }) {
  return (
    <button
      type="button"
      data-tour={dataTour}
      className="min-h-9 shrink-0 rounded-control border border-border-default bg-surface-card px-3 text-xs font-semibold text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}
