'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Search, X, Users, Dumbbell, ChefHat, ClipboardList, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { CoachSearchResults, SearchHit } from '@/services/search/coach-search.service'

/**
 * CoachGlobalSearch — búsqueda global del topbar coach (combobox APG accesible).
 *
 * Reemplaza la cáscara del input del topbar: dropdown de resultados AGRUPADOS
 * (Alumnos / Programas / Ejercicios / Recetas, cap 5/grupo) que consume
 * `GET /api/coach/search` con debounce + AbortController (cancela el fetch anterior → cero races).
 *
 * A11y (W3C APG — combobox editable con list autocomplete):
 *  - input `role="combobox"` + `aria-autocomplete="list"` + `aria-expanded` + `aria-controls`
 *    + `aria-activedescendant`; el foco DOM PERMANECE en el input.
 *  - popup `role="listbox"` con grupos `role="group"` + `aria-label`; ítems `role="option"`
 *    + `aria-selected`. La opción activa se mueve con `aria-activedescendant` + `scrollIntoView`
 *    manual (el navegador NO auto-scrollea a `aria-activedescendant`).
 *  - Teclado: ↓/↑ mueven la opción activa sobre la lista APLANADA (con wrap); Enter navega;
 *    Escape cierra y (si ya cerrado) limpia. El atajo "/" para enfocar vive en `CoachTopBar`.
 *
 * Desktop-only: se monta dentro del `<header hidden md:flex>` del topbar.
 */

const MIN_CHARS = 2
const DEBOUNCE_MS = 250

type GroupKey = keyof CoachSearchResults

const GROUP_META: ReadonlyArray<{ key: GroupKey; label: string; icon: typeof Users }> = [
    { key: 'clients', label: 'Alumnos', icon: Users },
    { key: 'programs', label: 'Programas', icon: ClipboardList },
    { key: 'exercises', label: 'Ejercicios', icon: Dumbbell },
    { key: 'recipes', label: 'Recetas', icon: ChefHat },
]

const EMPTY: CoachSearchResults = { clients: [], programs: [], exercises: [], recipes: [] }

/** Ítem aplanado (para el manejo por teclado sobre una única lista). */
type FlatHit = SearchHit & { group: GroupKey; groupLabel: string; flatIndex: number }

/** Resalta (case-insensitive) la sub-cadena que matchea la query dentro del label. */
function highlight(label: string, query: string): React.ReactNode {
    const q = query.trim()
    if (!q) return label
    const idx = label.toLowerCase().indexOf(q.toLowerCase())
    if (idx === -1) return label
    return (
        <>
            {label.slice(0, idx)}
            <mark className="bg-transparent font-bold text-[var(--sport-700)]">
                {label.slice(idx, idx + q.length)}
            </mark>
            {label.slice(idx + q.length)}
        </>
    )
}

export interface CoachGlobalSearchProps {
    /** Ref al input desde el topbar — preserva el atajo "/" (`inputRef.current?.focus()`). */
    inputRef: React.RefObject<HTMLInputElement | null>
}

export function CoachGlobalSearch({ inputRef }: CoachGlobalSearchProps) {
    const router = useRouter()
    const listboxId = useId()
    const optionIdPrefix = useId()

    const [query, setQuery] = useState('')
    const [debounced, setDebounced] = useState('')
    const [results, setResults] = useState<CoachSearchResults>(EMPTY)
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready'>('idle')
    const [open, setOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)

    const rootRef = useRef<HTMLDivElement>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const abortRef = useRef<AbortController | null>(null)

    const optionId = (index: number): string => `${optionIdPrefix}-opt-${index}`

    // Debounce del término (no golpea la DB en cada tecla).
    useEffect(() => {
        const id = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
        return () => clearTimeout(id)
    }, [query])

    // Fetch con AbortController: cancela el request en vuelo → una respuesta vieja no pisa la nueva.
    useEffect(() => {
        abortRef.current?.abort()
        if (debounced.length < MIN_CHARS) {
            setResults(EMPTY)
            setStatus('idle')
            return
        }
        const controller = new AbortController()
        abortRef.current = controller
        setStatus('loading')
        fetch(`/api/coach/search?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
            .then((r) => (r.ok ? (r.json() as Promise<CoachSearchResults>) : EMPTY))
            .then((data) => {
                if (controller.signal.aborted) return
                setResults(data ?? EMPTY)
                setStatus('ready')
            })
            .catch(() => {
                // Error silencioso (AC): abort o red caída → sin resultados, sin ruido.
                if (!controller.signal.aborted) {
                    setResults(EMPTY)
                    setStatus('ready')
                }
            })
        return () => controller.abort()
    }, [debounced])

    useEffect(() => () => abortRef.current?.abort(), [])

    // Lista APLANADA (para flechas/Enter) + total por grupo.
    const flat = useMemo<FlatHit[]>(() => {
        const acc: FlatHit[] = []
        for (const { key, label } of GROUP_META) {
            for (const hit of results[key]) {
                acc.push({ ...hit, group: key, groupLabel: label, flatIndex: acc.length })
            }
        }
        return acc
    }, [results])

    const hasQuery = debounced.length >= MIN_CHARS
    const showDropdown = open && hasQuery
    const isEmpty = status === 'ready' && flat.length === 0

    // Reset de la opción activa al cambiar el set de resultados.
    useEffect(() => {
        setActiveIndex(flat.length > 0 ? 0 : -1)
    }, [flat])

    // scrollIntoView manual: el navegador no sigue a aria-activedescendant.
    useEffect(() => {
        if (activeIndex < 0 || !listRef.current) return
        const el = listRef.current.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`)
        el?.scrollIntoView({ block: 'nearest' })
    }, [activeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

    // Cierre al click fuera.
    useEffect(() => {
        if (!showDropdown) return
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [showDropdown])

    function navigateTo(hit: SearchHit) {
        setOpen(false)
        setQuery('')
        setDebounced('')
        inputRef.current?.blur()
        router.push(hit.href)
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Escape') {
            if (showDropdown) {
                setOpen(false)
            } else {
                setQuery('')
                e.currentTarget.blur()
            }
            return
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            if (!showDropdown || flat.length === 0) return
            e.preventDefault()
            setOpen(true)
            setActiveIndex((prev) => {
                const next = e.key === 'ArrowDown' ? prev + 1 : prev - 1
                return (next + flat.length) % flat.length
            })
            return
        }
        if (e.key === 'Enter') {
            if (showDropdown && activeIndex >= 0 && flat[activeIndex]) {
                e.preventDefault()
                navigateTo(flat[activeIndex])
            }
        }
    }

    const activeId = showDropdown && activeIndex >= 0 ? optionId(activeIndex) : undefined

    return (
        <div ref={rootRef} className="relative mx-auto flex max-w-[460px] flex-1 items-center">
            <span className="pointer-events-none absolute left-3 z-[1] inline-flex text-[var(--text-subtle)]">
                {status === 'loading' ? (
                    <Loader2 size={17} className="animate-spin" />
                ) : (
                    <Search size={17} />
                )}
            </span>
            <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
                aria-controls={listboxId}
                aria-activedescendant={activeId}
                aria-label="Buscar alumno, programa, ejercicio o receta"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value)
                    setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Buscar alumno, programa, ejercicio…  (/)"
                className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-[38px] pr-[34px] text-sm text-[var(--text-strong)] outline-none transition-[border-color,background,box-shadow] duration-150 placeholder:text-[var(--text-subtle)] focus:border-[var(--sport-500)] focus:bg-[var(--surface-card)] focus:shadow-[var(--ring-focus)]"
            />
            {query && (
                <button
                    type="button"
                    onClick={() => {
                        setQuery('')
                        setDebounced('')
                        setOpen(false)
                        inputRef.current?.focus()
                    }}
                    aria-label="Limpiar"
                    className="absolute right-2 z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]"
                >
                    <X size={14} />
                </button>
            )}

            {showDropdown && (
                <div
                    className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)] animate-fade-in"
                >
                    {isEmpty ? (
                        <div className="px-4 py-6 text-center">
                            <p className="text-sm text-[var(--text-muted)]">
                                Sin resultados para{' '}
                                <span className="font-bold text-[var(--text-strong)]">
                                    «{debounced}»
                                </span>
                            </p>
                        </div>
                    ) : (
                        <ul
                            ref={listRef}
                            id={listboxId}
                            role="listbox"
                            aria-label="Resultados de búsqueda"
                            className="max-h-[min(70vh,440px)] overflow-y-auto py-1.5"
                        >
                            {GROUP_META.map(({ key, label, icon: GroupIcon }) => {
                                const hits = results[key]
                                if (hits.length === 0) return null
                                return (
                                    <li key={key} role="group" aria-label={label}>
                                        <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
                                            <GroupIcon size={12} />
                                            {label}
                                        </div>
                                        <ul role="presentation">
                                            {hits.map((hit) => {
                                                const item = flat.find(
                                                    (f) => f.group === key && f.id === hit.id,
                                                )!
                                                const isActive = item.flatIndex === activeIndex
                                                return (
                                                    <li
                                                        key={`${key}-${hit.id}`}
                                                        id={optionId(item.flatIndex)}
                                                        role="option"
                                                        aria-selected={isActive}
                                                        onMouseEnter={() =>
                                                            setActiveIndex(item.flatIndex)
                                                        }
                                                        onMouseDown={(e) => {
                                                            // mousedown (no click): evita el blur del
                                                            // input antes de navegar.
                                                            e.preventDefault()
                                                            navigateTo(hit)
                                                        }}
                                                        className={cn(
                                                            'mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors',
                                                            isActive
                                                                ? 'bg-[var(--sport-100)]'
                                                                : 'hover:bg-[var(--surface-sunken)]',
                                                        )}
                                                    >
                                                        <SearchHitThumb hit={hit} groupKey={key} />
                                                        <div className="min-w-0 flex-1">
                                                            <div
                                                                className={cn(
                                                                    'truncate text-[13.5px] font-semibold',
                                                                    isActive
                                                                        ? 'text-[var(--sport-700)]'
                                                                        : 'text-[var(--text-strong)]',
                                                                )}
                                                            >
                                                                {highlight(hit.label, debounced)}
                                                            </div>
                                                            {hit.sublabel && (
                                                                <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                                                                    {hit.sublabel}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    )
}

/** Miniatura del hit: imagen (ejercicio/receta), avatar de iniciales (alumno) o ícono de grupo. */
function SearchHitThumb({ hit, groupKey }: { hit: SearchHit; groupKey: GroupKey }) {
    if (groupKey === 'clients') {
        return <Avatar name={hit.label} size="sm" />
    }
    if (hit.thumbUrl) {
        return (
            <span className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white dark:bg-[var(--surface-sunken)]">
                <Image src={hit.thumbUrl} alt="" fill sizes="32px" className="object-cover" unoptimized />
            </span>
        )
    }
    const Icon = groupKey === 'programs' ? ClipboardList : groupKey === 'exercises' ? Dumbbell : ChefHat
    return (
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
            <Icon size={15} />
        </span>
    )
}
