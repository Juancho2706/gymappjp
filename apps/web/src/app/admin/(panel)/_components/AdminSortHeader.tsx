'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface Props {
    label: string
    sortKey: string
    className?: string
}

export function AdminSortHeader({ label, sortKey, className = '' }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const currentSort = searchParams.get('sort')
    const currentDir = searchParams.get('dir') ?? 'desc'
    const isActive = currentSort === sortKey

    function handleClick() {
        const params = new URLSearchParams(searchParams.toString())
        if (isActive) {
            params.set('dir', currentDir === 'desc' ? 'asc' : 'desc')
        } else {
            params.set('sort', sortKey)
            params.set('dir', 'desc')
        }
        params.set('page', '1')
        router.push(`${pathname}?${params.toString()}`)
    }

    const Icon = !isActive
        ? ChevronsUpDown
        : currentDir === 'desc'
            ? ChevronDown
            : ChevronUp

    const ariaSort: 'ascending' | 'descending' | 'none' = !isActive
        ? 'none'
        : currentDir === 'desc'
            ? 'descending'
            : 'ascending'

    return (
        <th
            aria-sort={ariaSort}
            className={`select-none whitespace-nowrap text-left text-[11px] font-medium uppercase tracking-widest ${className}`}
        >
            <button
                type="button"
                onClick={handleClick}
                className="flex w-full cursor-pointer items-center gap-1 px-3 py-2 text-muted transition-colors hover:text-body focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
            >
                {label}
                <Icon className={`h-3 w-3 ${isActive ? 'text-[var(--sport-500)]' : ''}`} />
            </button>
        </th>
    )
}
