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
}

export function AdminNavItem({ href, label, icon: Icon, mobile = false, collapsed = false }: Props) {
    const pathname = usePathname()
    const isActive = pathname.startsWith(href)

    if (mobile) {
        return (
            <Link
                href={href}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                    isActive
                        ? 'text-[--admin-accent]'
                        : 'text-[--admin-text-3] hover:text-[--admin-text-2]'
                }`}
            >
                <div className={`relative flex h-6 w-6 items-center justify-center ${isActive ? 'after:absolute after:-top-2 after:left-1/2 after:h-0.5 after:w-5 after:-translate-x-1/2 after:rounded-full after:bg-[--admin-accent] after:content-[""]' : ''}`}>
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
                className={`flex items-center justify-center rounded-md p-2 transition-colors ${
                    isActive
                        ? 'bg-[--admin-accent]/10 text-[--admin-accent]'
                        : 'text-[--admin-text-3] hover:bg-[--admin-bg-elevated] hover:text-[--admin-text-2]'
                }`}
            >
                <Icon className="h-4 w-4 shrink-0" />
            </Link>
        )
    }

    return (
        <Link
            href={href}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                    ? 'bg-[--admin-accent]/10 text-[--admin-accent]'
                    : 'text-[--admin-text-3] hover:bg-[--admin-bg-elevated] hover:text-[--admin-text-2]'
            }`}
        >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{label}</span>
        </Link>
    )
}
