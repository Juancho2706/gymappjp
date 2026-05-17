import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrgBySlug } from './_data/org.queries'
import { MfaBanner } from './_components/MfaBanner'
import { Building2, Users, UserCheck, Settings, LayoutDashboard, ChevronLeft } from 'lucide-react'

interface Props {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    return {
        title: {
            default: org?.name ?? 'Organización',
            template: `%s | ${org?.name ?? 'EVA Org'}`,
        },
    }
}

const NAV_ITEMS = [
    { href: '', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/coaches', label: 'Coaches', icon: Users },
    { href: '/clients', label: 'Clientes', icon: UserCheck },
    { href: '/settings', label: 'Configuración', icon: Settings },
]

export default async function OrgAdminLayout({ children, params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) {
        redirect('/coach/dashboard')
    }

    const baseHref = `/org/${slug}`

    return (
        <div className="flex min-h-dvh bg-background">
            {/* Sidebar */}
            <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card shrink-0">
                <div className="p-4 border-b border-border">
                    <Link
                        href="/coach/dashboard"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Panel Coach
                    </Link>
                    <div className="flex items-center gap-2">
                        {org.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={org.logo_url} alt={org.name} className="w-8 h-8 rounded-md object-cover" />
                        ) : (
                            <div
                                className="w-8 h-8 rounded-md flex items-center justify-center text-white font-bold text-sm"
                                style={{ backgroundColor: org.primary_color ?? '#10B981' }}
                            >
                                {org.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{org.name}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{org.myRole.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>
                <nav className="flex-1 p-3 space-y-0.5">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={`${baseHref}${href}`}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                            <Icon className="w-4 h-4 shrink-0" />
                            {label}
                        </Link>
                    ))}
                </nav>
                <div className="p-4 border-t border-border">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Building2 className="w-3 h-3" />
                        <span className="capitalize">{org.plan}</span>
                        <span>·</span>
                        <span className={org.status === 'active' ? 'text-emerald-500' : 'text-amber-500'}>
                            {org.status === 'active' ? 'Activo' : org.status}
                        </span>
                    </div>
                </div>
            </aside>

            {/* Mobile top bar */}
            <div className="flex flex-col flex-1 min-w-0">
                <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
                    <Link href="/coach/dashboard" className="text-muted-foreground hover:text-foreground">
                        <ChevronLeft className="w-5 h-5" />
                    </Link>
                    <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0"
                        style={{ backgroundColor: org.primary_color ?? '#10B981' }}
                    >
                        {org.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-semibold text-sm truncate">{org.name}</p>
                </header>

                {/* Mobile nav */}
                <nav className="md:hidden flex gap-1 px-3 pt-2 pb-1 border-b border-border overflow-x-auto">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={`${baseHref}${href}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent whitespace-nowrap transition-colors"
                        >
                            <Icon className="w-3.5 h-3.5 shrink-0" />
                            {label}
                        </Link>
                    ))}
                </nav>

                {org.myRole === 'org_owner' && <MfaBanner orgSlug={slug} />}
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </div>
        </div>
    )
}
