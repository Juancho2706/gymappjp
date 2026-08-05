'use client'

import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
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

// El tab activo vive en `?tab=` (compartible: "mándame el link de tus plantillas" ya no
// aterriza siempre en el roster). Los slugs son los de la UI, no las claves internas.
const TAB_PARAM = 'tab'

const TAB_SLUG: Record<TabKey, string> = {
  roster: 'alumnos',
  templates: 'plantillas',
  foods: 'alimentos',
  curation: 'curacion',
}

const TAB_BY_SLUG: Record<string, TabKey> = {
  alumnos: 'roster',
  plantillas: 'templates',
  alimentos: 'foods',
  curacion: 'curation',
}

/** Slug de la URL → tab. Ausente o desconocido cae al roster (el default de siempre). */
function parseTabParam(raw: string | null): TabKey {
  if (!raw) return 'roster'
  return TAB_BY_SLUG[raw] ?? 'roster'
}

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
 *
 * QW4 — el tab activo se refleja en `?tab=`: el estado inicial se lee de la URL (deep-link) y
 * cada cambio se escribe con `history.replaceState`, el mismo patron que el roster usa para
 * q/attn/sort. Es a proposito que NO se use el router: `push`/`replace` de Next refetchearian
 * el RSC de la pagina (roster + picker, dos round-trips) por cambiar de pestaña, y `push`
 * ademas llenaria el historial de entradas por cada click.
 */
export function NutritionHubTabs({ roster }: { roster: ReactNode }) {
  const searchParams = useSearchParams()
  // Solo el valor INICIAL viene de la URL; despues manda el estado local. La URL es un espejo,
  // no la fuente de verdad: el roster reescribe sus propios params al montarse y no debe poder
  // arrastrar la pestaña visible con el.
  const [active, setActive] = useState<TabKey>(() => parseTabParam(searchParams.get(TAB_PARAM)))
  const baseId = useId()
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([])

  const tabId = (key: TabKey) => `${baseId}-tab-${key}`
  const panelId = (key: TabKey) => `${baseId}-panel-${key}`

  /**
   * Cambia de pestaña y espeja el valor en la URL sin navegar ni tocar el historial.
   * Se lee `window.location.search` (y no el snapshot de `useSearchParams`) para no pisar los
   * params que el roster acaba de escribir: cursor, pila de paginacion y filtros. El roster es
   * el default, asi que se omite el param — igual que `serializeRosterFilters` omite sus
   * defaults, y ademas evita pelear con la reescritura de URL del propio roster.
   */
  const selectTab = useCallback((key: TabKey) => {
    setActive(key)
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (key === 'roster') params.delete(TAB_PARAM)
    else params.set(TAB_PARAM, TAB_SLUG[key])
    const qs = params.toString()
    const path = window.location.pathname
    window.history.replaceState(window.history.state, '', qs ? `${path}?${qs}` : path)
  }, [])

  const focusTab = useCallback(
    (index: number) => {
      const target = TABS[index]
      if (!target) return
      selectTab(target.key)
      buttonsRef.current[index]?.focus()
    },
    [selectTab],
  )

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
              onClick={() => selectTab(tab.key)}
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
