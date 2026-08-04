import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Los paneles pesados (catálogo + curación) montan islas cliente con server actions:
// para este test solo importa el contrato ARIA del tablist, así que se stubean.
vi.mock('./FoodCatalogBrowser', () => ({
  FoodCatalogBrowser: () => <div>catalogo</div>,
}))
vi.mock('./CurationQueue', () => ({
  CurationQueue: () => <div>curacion</div>,
}))
vi.mock('./PlanTemplatesLibrary', () => ({
  PlanTemplatesLibrary: () => <div>plantillas</div>,
}))

import { NutritionHubTabs } from './NutritionHubTabs'

function renderTabs() {
  return render(<NutritionHubTabs roster={<div>roster</div>} />)
}

describe('NutritionHubTabs (NUT-040 — patrón ARIA APG)', () => {
  it('cada tab apunta con aria-controls a un panel existente rotulado por él', () => {
    renderTabs()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(4)

    for (const tab of tabs) {
      const panelId = tab.getAttribute('aria-controls')
      expect(panelId).toBeTruthy()
      const panel = document.getElementById(panelId!)
      expect(panel).not.toBeNull()
      expect(panel!.getAttribute('role')).toBe('tabpanel')
      expect(panel!.getAttribute('aria-labelledby')).toBe(tab.id)
    }
  })

  it('aplica foco roving: solo el tab seleccionado es tabulable', () => {
    renderTabs()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('tabindex')).toBe('0')
    expect(tabs[1].getAttribute('tabindex')).toBe('-1')
    expect(tabs[2].getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowRight avanza y cicla; ArrowLeft retrocede', () => {
    renderTabs()
    const tablist = screen.getByRole('tablist')

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    // cicla al primero
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(screen.getAllByRole('tab')[3].getAttribute('aria-selected')).toBe('true')
  })

  it('Home/End saltan al primer y último tab', () => {
    renderTabs()
    const tablist = screen.getByRole('tablist')

    fireEvent.keyDown(tablist, { key: 'End' })
    expect(screen.getAllByRole('tab')[3].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tablist, { key: 'Home' })
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true')
  })

  it('solo el panel activo queda visible y montado', () => {
    renderTabs()
    expect(screen.getByText('roster')).toBeTruthy()
    expect(screen.queryByText('catalogo')).toBeNull()

    fireEvent.click(screen.getAllByRole('tab')[2])
    expect(screen.getByText('catalogo')).toBeTruthy()
    expect(screen.queryByText('roster')).toBeNull()
  })
})
