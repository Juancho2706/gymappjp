import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { ChefHat, ClipboardList, Dumbbell, Users } from 'lucide-react-native'
import { CommandPalette, type CommandGroup, type CommandItem } from '../CommandPalette'
import {
  COACH_SEARCH_MIN_CHARS,
  emptyCoachSearchResults,
  searchCoachWorkspace,
  type CoachSearchHit,
  type CoachSearchResults,
} from '../../lib/coach-search'

/**
 * CoachSearchPalette — búsqueda global del coach cableada (E7-11).
 *
 * Espejo mobile del `CoachGlobalSearch` del topbar web: combina la primitiva DS `CommandPalette`
 * (E0, data-agnostic) con el fetch a `/api/mobile/coach/search` (debounce 250ms + AbortController,
 * igual que web). Resultados AGRUPADOS (Alumnos / Programas / Ejercicios / Recetas) que navegan a la
 * pantalla mobile equivalente al tocar.
 *
 * CONTROLADO por el consumidor: el chrome/header monta `<CoachSearchPalette visible onClose />` y
 * dispara `visible` desde un botón de búsqueda (ver notas de integración). No dibuja el trigger.
 *
 * Traducción de rutas web → mobile (por grupo, no se parsea el `href` salvo el clientId del programa):
 *  - Alumnos   → `/coach/cliente/{id}`
 *  - Programas → asignado: `/coach/program-builder?clientId={clientId}`; plantilla: tab `/coach/builder`
 *  - Ejercicios→ tab `/coach/ejercicios?q={nombre}`
 *  - Recetas   → tab `/coach/nutricion?tab=recipes`
 */

const DEBOUNCE_MS = 250

type SearchKind = 'client' | 'program' | 'exercise' | 'recipe'
/** Payload que viaja en cada fila y vuelve en `onSelect` para decidir la navegación. */
type NavHit = CoachSearchHit & { kind: SearchKind }

/** `/coach/builder/{clientId}?programId=…` (web) → clientId; null para plantillas. */
function clientIdFromProgramHref(href: string): string | null {
  const m = /\/coach\/builder\/([^/?]+)/.exec(href)
  return m ? decodeURIComponent(m[1]) : null
}

export function CoachSearchPalette({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CoachSearchResults>(emptyCoachSearchResults)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle')

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset al cerrar: sin resultados viejos parpadeando la próxima vez que se abra.
  useEffect(() => {
    if (visible) return
    abortRef.current?.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery('')
    setResults(emptyCoachSearchResults())
    setStatus('idle')
  }, [visible])

  // Debounce + AbortController: cada tecla cancela la request y el timer previos.
  useEffect(() => {
    if (!visible) return
    const q = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    abortRef.current?.abort()

    if (q.length < COACH_SEARCH_MIN_CHARS) {
      setResults(emptyCoachSearchResults())
      setStatus('idle')
      return
    }

    setStatus('loading')
    debounceRef.current = setTimeout(() => {
      const ac = new AbortController()
      abortRef.current = ac
      searchCoachWorkspace(q, ac.signal)
        .then((r) => {
          if (ac.signal.aborted) return
          setResults(r)
          setStatus('ready')
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted || (err as { name?: string })?.name === 'AbortError') return
          // Fallo real (red/servidor): degradar a "sin resultados" en vez de quedar cargando.
          setResults(emptyCoachSearchResults())
          setStatus('ready')
        })
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, visible])

  const groups: ReadonlyArray<CommandGroup<NavHit>> = useMemo(() => {
    const toItems = (hits: CoachSearchHit[], kind: SearchKind, withAvatar: boolean) =>
      hits.map<CommandItem<NavHit>>((h) => ({
        id: `${kind}:${h.id}`,
        label: h.label,
        sublabel: h.sublabel,
        thumbUrl: withAvatar ? undefined : h.thumbUrl,
        avatarName: withAvatar ? h.label : undefined,
        data: { ...h, kind },
      }))
    return [
      { key: 'clients', label: 'Alumnos', icon: Users, items: toItems(results.clients, 'client', true) },
      { key: 'programs', label: 'Programas', icon: ClipboardList, items: toItems(results.programs, 'program', false).map((it) => ({ ...it, icon: ClipboardList })) },
      { key: 'exercises', label: 'Ejercicios', icon: Dumbbell, items: toItems(results.exercises, 'exercise', false).map((it) => ({ ...it, icon: Dumbbell })) },
      { key: 'recipes', label: 'Recetas', icon: ChefHat, items: toItems(results.recipes, 'recipe', false).map((it) => ({ ...it, icon: ChefHat })) },
    ]
  }, [results])

  function handleSelect(item: CommandItem<NavHit>) {
    const hit = item.data
    onClose()
    if (!hit) return
    switch (hit.kind) {
      case 'client':
        router.push(`/coach/cliente/${hit.id}`)
        return
      case 'program': {
        const clientId = clientIdFromProgramHref(hit.href)
        router.push(clientId ? `/coach/program-builder?clientId=${clientId}` : '/coach/builder')
        return
      }
      case 'exercise':
        router.push(`/coach/ejercicios?q=${encodeURIComponent(hit.label)}`)
        return
      case 'recipe':
        router.push('/coach/nutricion?tab=recipes')
        return
    }
  }

  return (
    <CommandPalette<NavHit>
      visible={visible}
      onClose={onClose}
      query={query}
      onQueryChange={setQuery}
      groups={groups}
      onSelect={handleSelect}
      status={status}
      minChars={COACH_SEARCH_MIN_CHARS}
      placeholder="Buscar alumnos, programas, ejercicios…"
      idleHint="Busca alumnos, programas, ejercicios o recetas de tu espacio."
    />
  )
}
