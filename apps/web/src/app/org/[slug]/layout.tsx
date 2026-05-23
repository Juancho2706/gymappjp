import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrgBySlug } from './_data/org.queries'
import { MfaBanner } from './_components/MfaBanner'
import { OrgSignOutButton } from './_components/OrgSignOutButton'
import {
    BadgeCheck,
    BarChart3,
    Building2,
    ClipboardCheck,
    FileText,
    LayoutDashboard,
    Megaphone,
    Palette,
    Salad,
    Settings,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react'

interface Props {
    children: React.ReactNode
    params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    return {
        title: {
            default: org?.name ?? 'Organizacion',
            template: `%s | ${org?.name ?? 'EVA Org'}`,
        },
    }
}

const NAV_ITEMS = [
    { href: '', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/coaches', label: 'Coaches', icon: Users },
    { href: '/clients', label: 'Alumnos', icon: UserCheck },
    { href: '/assignments', label: 'Asignaciones', icon: ClipboardCheck },
    { href: '/brand', label: 'Brand Center', icon: Palette },
    { href: '/reports', label: 'Reportes', icon: BarChart3 },
    { href: '/payments', label: 'Pagos alumnos', icon: BadgeCheck },
    { href: '/announcements', label: 'Novedades', icon: Megaphone },
    { href: '/nutrition', label: 'Nutricion', icon: Salad },
    { href: '/team', label: 'Team & Access', icon: ShieldCheck },
    { href: '/settings', label: 'Settings', icon: Settings },
    { href: '/audit', label: 'Audit Log', icon: FileText },
]

export default async function OrgAdminLayout({ children, params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)

    if (!org) {
        redirect('/coach/dashboard')
    }

    const baseHref = `/org/${slug}`

    return (
        <div className="flex min-h-dvh bg-zinc-950 text-zinc-100">
            <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
                <div className="border-b border-zinc-800 p-4">
                    <Link
                        href={baseHref}
                        className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300"
                    >
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        EVA Enterprise
                    </Link>
                    <div className="flex items-center gap-2">
                        {org.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={org.logo_url} alt={org.name} className="h-9 w-9 rounded-xl object-cover" />
                        ) : (
                            <div
                                className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white"
                                style={{ backgroundColor: org.primary_color ?? '#F59E0B' }}
                            >
                                {org.name.charAt(0).toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{org.name}</p>
                            <p className="text-[10px] capitalize text-zinc-500">{org.myRole.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={`${baseHref}${href}`}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
                        >
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {label}
                        </Link>
                    ))}
                </nav>

                <div className="space-y-3 border-t border-zinc-800 p-4">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        <span className="capitalize">{org.plan}</span>
                        <span>·</span>
                        <span className={org.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                            {org.status === 'active' ? 'Activo' : org.status}
                        </span>
                    </div>
                    <OrgSignOutButton />
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-3 md:hidden">
                    <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white"
                        style={{ backgroundColor: org.primary_color ?? '#F59E0B' }}
                    >
                        {org.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{org.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300">Enterprise</p>
                    </div>
                    <OrgSignOutButton />
                </header>

                <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-950 px-3 pb-1 pt-2 md:hidden">
                    {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={`${baseHref}${href}`}
                            className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
                        >
                            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
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

