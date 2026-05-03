'use client'

import { useState } from 'react'
import {
    Shield, ChevronLeft, ChevronRight,
    LayoutDashboard, Users, UserCheck,
    TrendingUp, ClipboardList, Activity, Wallet,
    Newspaper,
} from 'lucide-react'
import { AdminNavItem } from './AdminNavItem'
import { AdminLogoutButton } from './AdminLogoutButton'

const NAV_PLATAFORMA = [
    { href: '/admin/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',    icon: Users },
    { href: '/admin/clients',   label: 'Clientes',   icon: UserCheck },
    { href: '/admin/novedades', label: 'Novedades',  icon: Newspaper },
]
const NAV_FINANZAS = [
    { href: '/admin/finanzas',  label: 'Finanzas',   icon: TrendingUp },
]
const NAV_SISTEMA = [
    { href: '/admin/auditoria', label: 'Auditoría',  icon: ClipboardList },
    { href: '/admin/sistema',   label: 'Sistema',    icon: Activity },
]
const NAV_PERSONAL = [
    { href: '/admin/personal',  label: 'Personal',   icon: Wallet },
]
const NAV_MOBILE = [
    { href: '/admin/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',    icon: Users },
    { href: '/admin/clients',   label: 'Clientes',   icon: UserCheck },
    { href: '/admin/novedades', label: 'Novedades',  icon: Newspaper },
    { href: '/admin/finanzas',  label: 'Finanzas',   icon: TrendingUp },
    { href: '/admin/auditoria', label: 'Auditoría',  icon: ClipboardList },
]

interface Props {
    userEmail: string
}

export function AdminSidebar({ userEmail }: Props) {
    const [collapsed, setCollapsed] = useState(false)

    return (
        <>
            {/* Desktop sidebar */}
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
                        className="flex h-6 w-6 items-center justify-center rounded text-[--admin-text-3] hover:text-[--admin-text-2] hover:bg-[--admin-bg-elevated] transition-colors"
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
                        {NAV_PLATAFORMA.map(item => (
                            <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                        ))}
                    </div>
                    <div>
                        {!collapsed && (
                            <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                Finanzas
                            </p>
                        )}
                        {NAV_FINANZAS.map(item => (
                            <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                        ))}
                    </div>
                    <div>
                        {!collapsed && (
                            <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                Sistema
                            </p>
                        )}
                        {NAV_SISTEMA.map(item => (
                            <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
                        ))}
                    </div>
                    <div>
                        {!collapsed && (
                            <p className="mb-1.5 px-3 text-[10px] font-medium uppercase tracking-widest text-[--admin-text-3]">
                                Personal
                            </p>
                        )}
                        {NAV_PERSONAL.map(item => (
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

            {/* Mobile bottom tab bar */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[--admin-border] bg-[--admin-bg-surface] md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {NAV_MOBILE.map(item => (
                    <AdminNavItem key={item.href} {...item} mobile />
                ))}
            </nav>
        </>
    )
}
