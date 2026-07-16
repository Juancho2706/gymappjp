'use client'

import { useState, type ReactNode } from 'react'
import { Apple, ScanLine, Users } from 'lucide-react'
import { FoodCatalogBrowser } from './FoodCatalogBrowser'
import { CurationQueue } from './CurationQueue'

type TabKey = 'roster' | 'foods' | 'curation'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Users }> = [
  { key: 'roster', label: 'Alumnos', icon: Users },
  { key: 'foods', label: 'Alimentos', icon: Apple },
  { key: 'curation', label: 'Curacion', icon: ScanLine },
]

/**
 * Tabs del hub coach V2. El roster llega ya renderizado en el servidor (prop `roster`)
 * para no perder el streaming/paginacion RSC; "Alimentos" monta el buscador del catalogo
 * y "Curacion" la cola de codigos escaneados sin match; ambos se montan (client) solo al
 * activarse para no cargar catalogos junto con la lista de alumnos.
 */
export function NutritionHubTabs({ roster }: { roster: ReactNode }) {
  const [active, setActive] = useState<TabKey>('roster')

  return (
    <div>
      <div
        role="tablist"
        aria-label="Secciones del centro de nutricion"
        className="mb-5 flex gap-1 rounded-control border border-border-default bg-surface-card p-1"
      >
        {TABS.map((tab) => {
          const on = active === tab.key
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setActive(tab.key)}
              className={
                on
                  ? 'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary/100 px-3 text-sm font-semibold text-white'
                  : 'inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold text-muted hover:bg-surface-sunken'
              }
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" hidden={active !== 'roster'}>
        {active === 'roster' ? roster : null}
      </div>
      <div role="tabpanel" hidden={active !== 'foods'}>
        {active === 'foods' ? <FoodCatalogBrowser countryCode="CL" /> : null}
      </div>
      <div role="tabpanel" hidden={active !== 'curation'}>
        {active === 'curation' ? <CurationQueue countryCode="CL" /> : null}
      </div>
    </div>
  )
}
