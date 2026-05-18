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

    return (
        <th
            className={`cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-[--admin-text-3] hover:text-[--admin-text-2] transition-colors ${className}`}
            onClick={handleClick}
        >
            <span className="flex items-center gap-1">
                {label}
                <Icon className={`h-3 w-3 ${isActive ? 'text-[--admin-accent]' : ''}`} />
            </span>
        </th>
    )
}
