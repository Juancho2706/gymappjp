'use client'

import { useEffect, useState } from 'react'
import {
    Shield, ChevronLeft, ChevronRight, Menu,
    LayoutDashboard, Users, UserCheck,
    TrendingUp, ClipboardList, Activity, Wallet,
    Newspaper, Building2, UsersRound, Ticket,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { AdminNavItem } from './AdminNavItem'
import { AdminLogoutButton } from './AdminLogoutButton'

const NAV_PLATAFORMA = [
    { href: '/admin/dashboard', label: 'Dashboard',      icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',        icon: Users },
    { href: '/admin/clients',   label: 'Clientes',       icon: UserCheck },
    { href: '/admin/orgs',      label: 'Organizaciones', icon: Building2 },
    { href: '/admin/teams',     label: 'Equipos',        icon: UsersRound },
    { href: '/admin/codigos',   label: 'Códigos',        icon: Ticket },
    { href: '/admin/novedades', label: 'Novedades',      icon: Newspaper },
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

// Mobile: 4 destinos frecuentes + "Más" con TODO el resto. Antes habia 6 tabs y 5 secciones
// (Orgs, Teams, Códigos, Sistema, Personal) eran INALCANZABLES desde un telefono, y no
// existia logout mobile (F1 08-05).
const NAV_MOBILE = [
    { href: '/admin/dashboard', label: 'Inicio',     icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',    icon: Users },
    { href: '/admin/clients',   label: 'Clientes',   icon: UserCheck },
    { href: '/admin/finanzas',  label: 'Finanzas',   icon: TrendingUp },
]
const NAV_MOBILE_MORE = [
    { href: '/admin/orgs',      label: 'Organizaciones', icon: Building2 },
    { href: '/admin/teams',     label: 'Equipos',        icon: UsersRound },
    { href: '/admin/codigos',   label: 'Códigos',        icon: Ticket },
    { href: '/admin/novedades', label: 'Novedades',      icon: Newspaper },
    { href: '/admin/auditoria', label: 'Auditoría',      icon: ClipboardList },
    { href: '/admin/sistema',   label: 'Sistema',        icon: Activity },
    { href: '/admin/personal',  label: 'Personal',       icon: Wallet },
]

const COLLAPSE_KEY = 'admin-sidebar-collapsed'

interface Props {
    userEmail: string
}

function NavGroup({ title, items, collapsed }: { title: string; items: typeof NAV_PLATAFORMA; collapsed: boolean }) {
    return (
        <div>
            {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted">
                    {title}
                </p>
            )}
            {items.map(item => (
                <AdminNavItem key={item.href} {...item} collapsed={collapsed} />
            ))}
        </div>
    )
}

export function AdminSidebar({ userEmail }: Props) {
    const [collapsed, setCollapsed] = useState(false)
    const [moreOpen, setMoreOpen] = useState(false)

    // Persistencia del colapso (post-mount para no desincronizar la hidratacion).
    useEffect(() => {
        if (localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    }, [])
    function toggleCollapsed() {
        setCollapsed(c => {
            localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
            return !c
        })
    }

    return (
        <>
            {/* Desktop sidebar */}
            <aside
                className={`hidden shrink-0 flex-col border-r border-subtle bg-surface-card md:flex transition-all duration-200 ${
                    collapsed ? 'w-16' : 'w-56'
                }`}
            >
                {/* Header */}
                <div className={`flex items-center border-b border-subtle px-4 py-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
                    {!collapsed && (
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-[var(--sport-500)]" />
                            <span className="text-sm font-semibold tracking-wide">EVA CEO</span>
                        </div>
                    )}
                    {collapsed && <Shield className="h-4 w-4 text-[var(--sport-500)]" />}
                    <button
                        onClick={toggleCollapsed}
                        title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
                        aria-expanded={!collapsed}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-body hover:bg-surface-sunken transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] focus-visible:outline-none"
                    >
                        {collapsed
                            ? <ChevronRight className="h-3.5 w-3.5" />
                            : <ChevronLeft className="h-3.5 w-3.5" />
                        }
                    </button>
                </div>

                {/* Nav */}
                <nav aria-label="Secciones del panel" className={`flex flex-1 flex-col gap-5 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <NavGroup title="Plataforma" items={NAV_PLATAFORMA} collapsed={collapsed} />
                    <NavGroup title="Finanzas" items={NAV_FINANZAS} collapsed={collapsed} />
                    <NavGroup title="Sistema" items={NAV_SISTEMA} collapsed={collapsed} />
                    <NavGroup title="Personal" items={NAV_PERSONAL} collapsed={collapsed} />
                </nav>

                {/* Footer */}
                {!collapsed ? (
                    <div className="border-t border-subtle px-4 py-3">
                        <p className="mb-2 truncate text-[11px] text-muted">{userEmail}</p>
                        <AdminLogoutButton />
                    </div>
                ) : (
                    <div className="border-t border-subtle px-2 py-3 flex justify-center">
                        <AdminLogoutButton iconOnly />
                    </div>
                )}
            </aside>

            {/* Mobile bottom tab bar: 4 destinos + Más */}
            <nav
                aria-label="Navegación móvil"
                className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-subtle bg-surface-card md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {NAV_MOBILE.map(item => (
                    <AdminNavItem key={item.href} {...item} mobile />
                ))}
                <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                    <SheetTrigger
                        aria-label="Más secciones"
                        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-muted transition-colors hover:text-body"
                    >
                        <div className="flex h-6 w-6 items-center justify-center">
                            <Menu className="h-4 w-4" />
                        </div>
                        Más
                    </SheetTrigger>
                    <SheetContent side="bottom" className="border-subtle bg-surface-card">
                        <SheetHeader className="pb-1">
                            <SheetTitle className="text-sm text-strong">Más secciones</SheetTitle>
                        </SheetHeader>
                        <nav aria-label="Más secciones" className="grid grid-cols-2 gap-1 pb-2">
                            {NAV_MOBILE_MORE.map(item => (
                                <AdminNavItem key={item.href} {...item} onNavigate={() => setMoreOpen(false)} />
                            ))}
                        </nav>
                        <div className="flex items-center justify-between border-t border-subtle pt-3 pb-[env(safe-area-inset-bottom)]">
                            <p className="truncate text-[11px] text-muted">{userEmail}</p>
                            <AdminLogoutButton iconOnly />
                        </div>
                    </SheetContent>
                </Sheet>
            </nav>
        </>
    )
}
