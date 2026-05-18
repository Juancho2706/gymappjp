'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
    total: number
    pageSize: number
}

export function AdminPagination({ total, pageSize }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const page = parseInt(searchParams.get('page') ?? '1', 10)
    const totalPages = Math.ceil(total / pageSize)
    const from = (page - 1) * pageSize + 1
    const to = Math.min(page * pageSize, total)

    if (totalPages <= 1) return null

    function go(p: number) {
        const params = new URLSearchParams(searchParams.toString())
        params.set('page', String(p))
        router.push(`${pathname}?${params.toString()}`)
    }

    return (
        <div className="flex items-center justify-between border-t border-[--admin-border] px-4 py-3">
            <span className="font-mono text-xs text-[--admin-text-3]">
                {from}–{to} de {total}
            </span>
            <div className="flex items-center gap-1">
                <button
                    disabled={page <= 1}
                    onClick={() => go(page - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-3] hover:text-[--admin-text-1] disabled:opacity-30 transition-colors"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono text-xs text-[--admin-text-2] px-2">
                    {page} / {totalPages}
                </span>
                <button
                    disabled={page >= totalPages}
                    onClick={() => go(page + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[--admin-border] bg-[--admin-bg-elevated] text-[--admin-text-3] hover:text-[--admin-text-1] disabled:opacity-30 transition-colors"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}
