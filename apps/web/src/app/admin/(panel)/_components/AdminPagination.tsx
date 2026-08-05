'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
    total: number
    pageSize: number
}

const NAV_BTN =
    'flex h-7 w-7 items-center justify-center rounded border border-subtle bg-surface-sunken text-muted transition-colors hover:text-strong disabled:opacity-30 focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none'

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
        <div className="flex items-center justify-between border-t border-subtle px-4 py-3">
            <span className="font-mono text-xs text-muted">
                {from}–{to} de {total}
            </span>
            <div className="flex items-center gap-1">
                <button
                    type="button"
                    aria-label="Página anterior"
                    disabled={page <= 1}
                    onClick={() => go(page - 1)}
                    className={NAV_BTN}
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono text-xs text-body px-2">
                    {page} / {totalPages}
                </span>
                <button
                    type="button"
                    aria-label="Página siguiente"
                    disabled={page >= totalPages}
                    onClick={() => go(page + 1)}
                    className={NAV_BTN}
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}
