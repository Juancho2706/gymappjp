'use client'

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Apple, Copy, ScanLine, Users } from 'lucide-react'
import { FoodCatalogBrowser } from './FoodCatalogBrowser'
import { CurationQueue } from './CurationQueue'
import { PlanTemplatesLibrary } from './PlanTemplatesLibrary'

type TabKey = 'roster' | 'templates' | 'foods' | 'curation'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: 'roster', label: 'Alumnos', icon: Users },
  { key: 'templates', label: 'Plantillas', icon: Copy },
  { key: 'foods', label: 'Alimentos', icon: Apple },
  { key: 'curation', label: 'Curación', icon: ScanLine },
]

/**
 * Tabs del hub coach V2. El roster llega ya renderizado en el servidor (prop `roster`)
 * para no perder el streaming/paginacion RSC; "Alimentos" monta el buscador del catalogo
 * y "Curacion" la cola de codigos escaneados sin match; ambos se montan (client) solo al
 * activarse para no cargar catalogos junto con la lista de alumnos.
 *
 * NUT-040 — patron ARIA APG completo para tabs:
 * - relacion `id` / `aria-controls` (tab → panel) y `aria-labelledby` (panel → tab);
 * - foco roving: solo el tab activo es tabulable (`tabIndex 0`), el resto `-1`;
 * - navegacion con flechas Izquierda/Derecha (ciclica) + Home/End, moviendo la seleccion
 *   y el foco juntos (patron "automatic activation", coherente con paneles que se montan
 *   al activarse);
 * - los paneles son focalizables (`tabIndex 0`) para que el lector llegue al contenido
 *   con un solo Tab desde el tablist.
 */
export function NutritionHubTabs({ roster }: { roster: ReactNode }) {
  const [active, setActive] = useState<TabKey>('roster')
  const baseId = useId()
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const tabId = (key: TabKey) => `${baseId}-tab-${key}`
  const panelId = (key: TabKey) => `${baseId}-panel-${key}`

  const focusTab = useCallback((index: number) => {
    const target = TABS[index]
    if (!target) return
    setActive(target.key)
    buttonsRef.current[index]?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const current = TABS.findIndex((tab) => tab.key === active)
      if (current < 0) return
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          focusTab((current + 1) % TABS.length)
          break
        case 'ArrowLeft':
          event.preventDefault()
          focusTab((current - 1 + TABS.length) % TABS.length)
          break
        case 'Home':
          event.preventDefault()
          focusTab(0)
          break
        case 'End':
          event.preventDefault()
          focusTab(TABS.length - 1)
          break
        default:
          break
      }
    },
    [active, focusTab],
  )

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secciones del centro de nutrición"
        onKeyDown={onKeyDown}
        className="mb-5 flex gap-1 rounded-control border border-border-default bg-surface-card p-1"
      >
        {TABS.map((tab, index) => {
          const on = active === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              id={tabId(tab.key)}
              ref={(node) => {
                buttonsRef.current[index] = node
              }}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={panelId(tab.key)}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab.key)}
              // min-w-0 permite que flex-1 encoja el pill activo dentro del contenedor en 360px;
              // el ícono se oculta bajo sm para que los 3 labels quepan sin desbordar ni truncar.
              className={
                on
                  ? 'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary/100 px-2 text-sm font-semibold text-white sm:px-3'
                  : 'inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] px-2 text-sm font-semibold text-muted hover:bg-surface-sunken sm:px-3'
              }
            >
              <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="truncate">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId('roster')}
        aria-labelledby={tabId('roster')}
        tabIndex={0}
        hidden={active !== 'roster'}
      >
        {active === 'roster' ? roster : null}
      </div>
      <div
        role="tabpanel"
        id={panelId('templates')}
        aria-labelledby={tabId('templates')}
        tabIndex={0}
        hidden={active !== 'templates'}
      >
        {active === 'templates' ? <PlanTemplatesLibrary /> : null}
      </div>
      <div
        role="tabpanel"
        id={panelId('foods')}
        aria-labelledby={tabId('foods')}
        tabIndex={0}
        hidden={active !== 'foods'}
      >
        {active === 'foods' ? <FoodCatalogBrowser countryCode="CL" /> : null}
      </div>
      <div
        role="tabpanel"
        id={panelId('curation')}
        aria-labelledby={tabId('curation')}
        tabIndex={0}
        hidden={active !== 'curation'}
      >
        {active === 'curation' ? <CurationQueue countryCode="CL" /> : null}
      </div>
    </div>
  )
}
