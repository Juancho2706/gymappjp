'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { Building2, Users, UserCheck, Settings, LayoutDashboard, ClipboardList } from 'lucide-react'
import { useDemoState } from '../_providers/DemoStateProvider'

const NAV_ITEMS = [
    { href: '/movidatest/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/movidatest/admin/coaches', label: 'Coaches', icon: Users },
    { href: '/movidatest/admin/clients', label: 'Clientes', icon: UserCheck },
    { href: '/movidatest/admin/settings', label: 'Configuración', icon: Settings },
    { href: '/movidatest/admin/onboarding', label: 'Onboarding', icon: ClipboardList },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { org } = useDemoState()
    const pathname = usePathname()

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card shrink-0">
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <Image src="/logomovida.png" alt={org.name} width={80} height={28} className="h-7 w-auto object-contain" />
                    </div>
                </div>
                <nav className="flex-1 p-3 space-y-0.5">
                    {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                        const active = exact ? pathname === href : pathname.startsWith(href)
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    active
                                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                            >
                                <Icon className="w-4 h-4 shrink-0" />
                                {label}
                            </Link>
                        )
                    })}
                </nav>
                <div className="p-4 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span className="capitalize">{org.plan}</span>
                        <span>·</span>
                        <span className="text-emerald-500">Activo</span>
                    </div>
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="flex flex-col flex-1 min-w-0">
                <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
                    <Image src="/logomovida.png" alt={org.name} width={70} height={24} className="h-6 w-auto object-contain" />
                    <p className="font-semibold text-sm truncate flex-1">{org.name}</p>
                </header>
                <nav className="md:hidden flex gap-1 px-3 pt-2 pb-1 border-b border-border overflow-x-auto">
                    {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                        const active = exact ? pathname === href : pathname.startsWith(href)
                        return (
                            <Link
                                key={href}
                                href={href}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                                    active
                                        ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5 shrink-0" />
                                {label}
                            </Link>
                        )
                    })}
                </nav>
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
