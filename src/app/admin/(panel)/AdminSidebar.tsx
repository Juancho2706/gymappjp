'use client'

import { useState } from 'react'
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react'
import { AdminNavItem } from './AdminNavItem'
import { AdminLogoutButton } from './AdminLogoutButton'
import { LucideIcon } from 'lucide-react'

interface NavItem {
    href: string
    label: string
    icon: LucideIcon
}

interface Props {
    navPlataforma: NavItem[]
    navFinanzas: NavItem[]
    navSistema: NavItem[]
    userEmail: string
}

export function AdminSidebar({ navPlataforma, navFinanzas, navSistema, userEmail }: Props) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <aside
            className={`hidden shrink-0 flex-col border-r border-[--admin-border] bg-[--admin-bg-surface] md:flex transition-all duration-200 ${
                collapsed ? 'w-16' : 'w-56'
            }`}
        >
            {/* Header */}
            <div className={`flex items-center border-b border-[--admin-border] px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                {!collapsed && (
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-[--admin-accent]" />
                        <span className="text-sm font-semibold tracking-wide">EVA CEO</span>
                    </div>
                )}
                {collapsed && <Shield className="h-4 w-4 text-[--admin-accent]" />}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className={`flex h-6 w-6 items-center justify-center rounded text-[--admin-text-3] hover:text-[--admin-text-2] hover:bg-[--admin-bg-elevated] transition-colors ${collapsed ? 'mt-0' : ''}`}
                    title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
                >
                    {collapsed
                        ? <ChevronRight className="h-3.5 w-3.5" />
                        : <ChevronLeft className="h-3.5 w-3.5" />
                    }
                </button>
            </div>

            {/* Nav */}
            <nav className={`flex flex-1 flex-col gap-5 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
                <div>
                    {!collapsed && (
                        <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                            Plataforma
                        </p>
                    )}
                    {navPlataforma.map(item => (
                        <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                    ))}
                </div>
                <div>
                    {!collapsed && (
                        <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                            Finanzas
                        </p>
                    )}
                    {navFinanzas.map(item => (
                        <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                    ))}
                </div>
                <div>
                    {!collapsed && (
                        <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                            Sistema
                        </p>
                    )}
                    {navSistema.map(item => (
                        <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                    ))}
                </div>
            </nav>

            {/* Footer */}
            {!collapsed ? (
                <div className="border-t border-[--admin-border] px-4 py-3">
                    <p className="mb-2 truncate text-[11px] text-[--admin-text-3]">{userEmail}</p>
                    <AdminLogoutButton />
                </div>
            ) : (
                <div className="border-t border-[--admin-border] px-2 py-3 flex justify-center">
                    <AdminLogoutButton iconOnly />
                </div>
            )}
        </aside>
    )
}
