'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LucideIcon } from 'lucide-react'

interface Props {
    href: string
    label: string
    icon: LucideIcon
    mobile?: boolean
    collapsed?: boolean
    onNavigate?: () => void
}

export function AdminNavItem({ href, label, icon: Icon, mobile = false, collapsed = false, onNavigate }: Props) {
    const pathname = usePathname()
    const isActive = pathname.startsWith(href)
    const ariaCurrent = isActive ? ('page' as const) : undefined

    if (mobile) {
        return (
            <Link
                href={href}
                aria-current={ariaCurrent}
                onClick={onNavigate}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                    isActive
                        ? 'text-[var(--sport-500)]'
                        : 'text-muted hover:text-body'
                }`}
            >
                <div className={`relative flex h-6 w-6 items-center justify-center ${isActive ? 'after:absolute after:-top-2 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-[var(--sport-500)] after:content-[""]' : ''}`}>
                    <Icon className="h-4 w-4" />
                </div>
                {label}
            </Link>
        )
    }

    if (collapsed) {
        return (
            <Link
                href={href}
                title={label}
                aria-current={ariaCurrent}
                className={`flex items-center justify-center rounded-md p-2 transition-colors ${
                    isActive
                        ? 'bg-sport-500/10 text-[var(--sport-500)]'
                        : 'text-muted hover:bg-surface-sunken hover:text-body'
                }`}
            >
                <Icon className="h-4 w-4 shrink-0" />
            </Link>
        )
    }

    return (
        <Link
            href={href}
            aria-current={ariaCurrent}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                    ? 'bg-sport-500/10 text-[var(--sport-500)]'
                    : 'text-muted hover:bg-surface-sunken hover:text-body'
            }`}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
        </Link>
    )
}
