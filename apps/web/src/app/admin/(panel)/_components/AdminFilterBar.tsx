'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useRef, useTransition } from 'react'
import { Search, X } from 'lucide-react'

interface FilterOption { value: string; label: string }

interface Props {
    filters?: {
        key: string
        placeholder: string
        options: FilterOption[]
    }[]
    searchPlaceholder?: string
    toggles?: { key: string; label: string }[]
}

export function AdminFilterBar({ filters = [], searchPlaceholder = 'Buscar...', toggles = [] }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [, startTransition] = useTransition()
    const searchRef = useRef<HTMLInputElement>(null)

    function push(updates: Record<string, string | null>) {
        const params = new URLSearchParams(searchParams.toString())
        for (const [k, v] of Object.entries(updates)) {
            if (v === null || v === '') params.delete(k)
            else params.set(k, v)
        }
        params.set('page', '1')
        startTransition(() => router.push(`${pathname}?${params.toString()}`))
    }

    function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
        push({ q: e.target.value || null })
    }

    function handleFilter(key: string, value: string) {
        push({ [key]: value || null })
    }

    function handleToggle(key: string) {
        const current = searchParams.get(key)
        push({ [key]: current ? null : 'true' })
    }

    function handleReset() {
        startTransition(() => router.push(pathname))
        if (searchRef.current) searchRef.current.value = ''
    }

    const hasFilters = searchParams.size > 0 && !Array.from(searchParams.keys()).every(k => k === 'page')

    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[--admin-text-3]" />
                <input
                    ref={searchRef}
                    defaultValue={searchParams.get('q') ?? ''}
                    onChange={handleSearch}
                    placeholder={searchPlaceholder}
                    className="h-8 rounded border border-[--admin-border] bg-[--admin-bg-elevated] pl-8 pr-3 text-xs text-[--admin-text-1] placeholder:text-[--admin-text-3] focus:border-[--admin-accent] focus:outline-none w-48"
                />
            </div>

            {filters.map(f => (
                <select
                    key={f.key}
                    value={searchParams.get(f.key) ?? ''}
                    onChange={e => handleFilter(f.key, e.target.value)}
                    className="h-8 rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2 text-xs text-[--admin-text-1] focus:border-[--admin-accent] focus:outline-none"
                >
                    <option value="">{f.placeholder}</option>
                    {f.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
            ))}

            {toggles.map(t => {
                const active = searchParams.get(t.key) === 'true'
                return (
                    <button
                        key={t.key}
                        onClick={() => handleToggle(t.key)}
                        className={`h-8 rounded border px-2.5 text-xs transition-colors ${
                            active
                                ? 'border-[--admin-accent] bg-[--admin-accent]/15 text-[--admin-accent]'
                                : 'border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-3] hover:border-[--admin-text-3]'
                        }`}
                    >
                        {t.label}
                    </button>
                )
            })}

            {hasFilters && (
                <button
                    onClick={handleReset}
                    className="flex h-8 items-center gap-1 rounded border border-[--admin-border] bg-[--admin-bg-elevated] px-2.5 text-xs text-[--admin-text-3] hover:text-[--admin-text-2] transition-colors"
                >
                    <X className="h-3 w-3" />
                    Reset
                </button>
            )}
        </div>
    )
}
