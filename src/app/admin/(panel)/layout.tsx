import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { AdminDarkWrapper } from './AdminDarkWrapper'
import { AdminNavItem } from './AdminNavItem'
import { AdminSidebar } from './AdminSidebar'
import {
    LayoutDashboard, Users, UserCheck,
    TrendingUp, ClipboardList, Activity
} from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: { default: 'Panel CEO', template: '%s | CEO | EVA' },
}

const NAV_PLATAFORMA = [
    { href: '/admin/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',    icon: Users },
    { href: '/admin/clients',   label: 'Clientes',   icon: UserCheck },
]
const NAV_FINANZAS = [
    { href: '/admin/finanzas',  label: 'Finanzas',   icon: TrendingUp },
]
const NAV_SISTEMA = [
    { href: '/admin/auditoria', label: 'Auditoría',  icon: ClipboardList },
    { href: '/admin/sistema',   label: 'Sistema',    icon: Activity },
]

// Mobile tabs: max 5 most important
const NAV_MOBILE = [
    { href: '/admin/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
    { href: '/admin/coaches',   label: 'Coaches',    icon: Users },
    { href: '/admin/clients',   label: 'Clientes',   icon: UserCheck },
    { href: '/admin/finanzas',  label: 'Finanzas',   icon: TrendingUp },
    { href: '/admin/auditoria', label: 'Auditoría',  icon: ClipboardList },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user?.email || !isAdminEmail(user.email)) {
        redirect('/admin/login')
    }

    return (
        <AdminDarkWrapper>
            <div className="admin-shell flex min-h-[100dvh] flex-col bg-[--admin-bg-base] text-[--admin-text-1] md:flex-row">

                {/* Desktop sidebar — collapsible */}
                <AdminSidebar
                    navPlataforma={NAV_PLATAFORMA}
                    navFinanzas={NAV_FINANZAS}
                    navSistema={NAV_SISTEMA}
                    userEmail={user.email}
                />

                {/* Main content */}
                <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
                    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
                        {children}
                    </div>
                </main>

                {/* Mobile bottom tab bar */}
                <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[--admin-border] bg-[--admin-bg-surface] md:hidden"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                    {NAV_MOBILE.map(item => (
                        <AdminNavItem key={item.href} {...item} mobile />
                    ))}
                </nav>
            </div>
        </AdminDarkWrapper>
    )
}
