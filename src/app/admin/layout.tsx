import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { AdminLogoutButton } from './AdminLogoutButton'
import { LayoutDashboard, Users, UserCheck, Shield } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: {
        default: 'Panel CEO',
        template: '%s | CEO | EVA',
    },
}

const NAV_ITEMS = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/coaches', label: 'Coaches', icon: Users },
    { href: '/admin/clients', label: 'Clientes', icon: UserCheck },
]

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user?.email || !isAdminEmail(user.email)) {
        redirect('/admin/login')
    }

    return (
        <div className="flex min-h-[100dvh] flex-col bg-neutral-950 text-neutral-100 md:flex-row">
            {/* Sidebar */}
            <aside className="flex w-full flex-col border-b border-neutral-800 bg-neutral-900/50 md:w-64 md:border-b-0 md:border-r">
                <div className="flex items-center gap-2 px-4 py-5">
                    <Shield className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm font-semibold tracking-wide">EVA CEO</span>
                </div>

                <nav className="flex flex-1 flex-row gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible">
                    {NAV_ITEMS.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
                        >
                            <item.icon className="h-4 w-4" />
                            <span className="hidden md:inline">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="border-t border-neutral-800 px-4 py-3">
                    <p className="mb-2 truncate text-xs text-neutral-500">{user.email}</p>
                    <AdminLogoutButton />
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
                    {children}
                </div>
            </main>
        </div>
    )
}
