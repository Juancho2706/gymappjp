import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { NutritionCoachHubItem } from '@eva/nutrition-v2'

/**
 * Montaje de la Guía Viva en el HUB (SPEC `nutrition-onboarding-tour`, G2.2).
 *
 * Este test existe porque el hub REAL es el único de las cuatro superficies que ningún gate de
 * navegador alcanza: el harness (`scripts/cabina-visual-check.mjs`) solo levanta el editor, y la
 * página del hub necesita sesión y Supabase. Sin esto, borrar un `data-tour` del roster no rompería
 * nada visible — el tour simplemente empezaría a pintar tarjetas sin recorte, en silencio.
 *
 * Lo que SÍ verifica: que los seis targets del guion existen sobre los elementos reales y que el
 * «?» abre, avanza y cierra el tour marcando la memoria. Lo que NO puede verificar: geometría
 * (jsdom no hace layout: todos los rects son cero). D3 vive en los tests del posicionador
 * (`tour-geometry.test.ts`) y en el gate visual del editor.
 */

// Los paneles pesados de las otras pestañas montan islas cliente con server actions; el roster es
// el único que este test necesita de verdad.
vi.mock('./FoodCatalogBrowser', () => ({ FoodCatalogBrowser: () => <div>catalogo</div> }))
vi.mock('./CurationQueue', () => ({ CurationQueue: () => <div>curacion</div> }))
vi.mock('./PlanTemplatesLibrary', () => ({ PlanTemplatesLibrary: () => <div>plantillas</div> }))

import { NutritionHubTabs } from './NutritionHubTabs'
import { HubRoster } from './HubRoster'
import { HubTourGuide } from './HubTourGuide'
import { DEFAULT_ROSTER_FILTERS } from '../_lib/hub-roster'
import { HUB_TOUR_STEPS, tourFlagKey } from '@/components/nutrition-v2'

const COACH_ID = '11111111-1111-4111-8111-111111111111'

function hubItem(index: number): NutritionCoachHubItem {
  return {
    clientId: `2222222${index}-2222-4222-8222-222222222222`,
    clientName: `Alumna ${index}`,
    planId: `3333333${index}-3333-4333-8333-333333333333`,
    versionId: `4444444${index}-4444-4444-8444-444444444444`,
    versionNumber: 2,
    planName: 'Plan de volumen',
    strategy: 'structured',
    planStatus: 'published',
    effectiveFrom: '2026-08-01',
    lastIntakeAt: '2026-08-16T12:00:00.000Z',
    activeDays7d: 5,
    intakeEntries7d: 18,
    pendingDrafts: 0,
    attentionReason: 'none',
    updatedAt: '2026-08-16T12:00:00.000Z',
    phone: '+56900000000',
    activeDaysPrev7d: 5,
    days7d: [],
    attentionScore: null,
  }
}

function renderHub() {
  return render(
    <>
      <HubTourGuide coachId={COACH_ID} />
      <NutritionHubTabs
        coachId={COACH_ID}
        roster={
          <HubRoster
            items={[hubItem(1), hubItem(2)]}
            metrics={{ total: 2, withPlan: 2, withoutPlan: 0, activeToday: 1 }}
            hasMore={false}
            nextCursor={null}
            initialFilters={DEFAULT_ROSTER_FILTERS}
            todayIso="2026-08-16"
            timeZone="America/Santiago"
          />
        }
      />
    </>,
  )
}

const anchors = (target: string) => document.querySelectorAll(`[data-tour="${target}"]`)

beforeAll(() => {
  // jsdom no implementa `scrollIntoView` y el motor lo llama al entrar a cada paso (D3: primero
  // traer el target a la vista). Sin layout real, `needsScrollIntoView` siempre da true acá.
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  window.localStorage.clear()
})

describe('Guía Viva — montaje en el Centro de Nutrición', () => {
  it('los seis targets del guion existen sobre los elementos reales del hub', () => {
    renderHub()
    for (const step of HUB_TOUR_STEPS) {
      expect(anchors(step.target).length, `falta data-tour="${step.target}"`).toBeGreaterThan(0)
    }
  })

  it('el ancla del tablist va sobre el tablist y la de la fila sobre la PRIMERA fila del roster', () => {
    renderHub()
    expect(anchors('tabs')[0]?.getAttribute('role')).toBe('tablist')
    // La fila existe dos veces (card en móvil, `<tr>` en desktop) y las dos son de la MISMA alumna:
    // el CSS decide cuál se ve y el motor se queda con la renderizada.
    const rows = [...anchors('alumno-row')]
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.textContent).toContain('Alumna 1')
    expect([...anchors('nueva-version')]).toHaveLength(2)
  })

  it('auto-arranca en la pestaña Alumnos, avanza los 6 pasos y «Listo» marca la memoria', () => {
    renderHub()

    // D4: sin flag previo, entrar al hub abre la guía sola.
    const overlay = document.querySelector('[data-tour-overlay]')
    expect(overlay).not.toBeNull()
    expect(overlay?.getAttribute('data-tour-total')).toBe(String(HUB_TOUR_STEPS.length))

    for (let step = 1; step < HUB_TOUR_STEPS.length; step += 1) {
      const current = document.querySelector('[data-tour-overlay]')
      expect(current?.getAttribute('data-tour-step')).toBe(String(step))
      expect(current?.getAttribute('data-tour-target')).toBe(HUB_TOUR_STEPS[step - 1].target)
      fireEvent.click(document.querySelector('[data-tour-action="next"]')!)
    }

    // Último paso: el botón deja de ser «siguiente» y pasa a ser «Listo».
    expect(document.querySelector('[data-tour-overlay]')?.getAttribute('data-tour-step')).toBe(
      String(HUB_TOUR_STEPS.length),
    )
    fireEvent.click(document.querySelector('[data-tour-action="done"]')!)

    expect(document.querySelector('[data-tour-overlay]')).toBeNull()
    expect(window.localStorage.getItem(tourFlagKey('hub', COACH_ID))).toBe('1')
  })

  it('con la memoria marcada no auto-arranca, pero el «?» repite la guía', () => {
    window.localStorage.setItem(tourFlagKey('hub', COACH_ID), '1')
    renderHub()

    expect(document.querySelector('[data-tour-overlay]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir la guía de esta pantalla' }))
    expect(document.querySelector('[data-tour-overlay]')?.getAttribute('data-tour-step')).toBe('1')

    // «Saltar» está en todos los pasos y cierra (el tour jamás bloquea la salida).
    fireEvent.click(document.querySelector('[data-tour-action="skip"]')!)
    expect(document.querySelector('[data-tour-overlay]')).toBeNull()
  })
})
