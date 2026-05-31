'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { OrgSignOutButton } from './OrgSignOutButton'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import type { WorkspaceSummary } from '@/domain/auth/types'

type NavChild = {
    href: string
    label: string
    shortLabel?: string
    icon: LucideIcon
}

type NavGroup = {
    id: string
    label: string
    shortLabel: string
    href: string
    icon: LucideIcon
    children: NavChild[]
}

const NAV_GROUPS: NavGroup[] = [
    {
        id: 'command',
        label: 'Command Center',
        shortLabel: 'Inicio',
        href: '',
        icon: LayoutDashboard,
        children: [
            { href: '/reports', label: 'Insights', shortLabel: 'Reportes', icon: BarChart3 },
        ],
    },
    {
        id: 'operations',
        label: 'Operaciones',
        shortLabel: 'Ops',
        href: '/clients',
        icon: UserCheck,
        children: [
            { href: '/clients', label: 'Alumnos', icon: UserCheck },
            { href: '/assignments', label: 'Asignaciones', shortLabel: 'Asignar', icon: ClipboardCheck },
            { href: '/payments', label: 'Pagos alumnos', shortLabel: 'Pagos', icon: BadgeCheck },
        ],
    },
    {
        id: 'team',
        label: 'Equipo',
        shortLabel: 'Equipo',
        href: '/coaches',
        icon: Users,
        children: [
            { href: '/coaches', label: 'Coaches', icon: Users },
            { href: '/team', label: 'Staff & Access', shortLabel: 'Staff', icon: ShieldCheck },
        ],
    },
    {
        id: 'brand',
        label: 'Marca',
        shortLabel: 'Marca',
        href: '/brand',
        icon: Palette,
        children: [
            { href: '/brand', label: 'Brand Studio', shortLabel: 'Studio', icon: Palette },
        ],
    },
    {
        id: 'tools',
        label: 'Herramientas',
        shortLabel: 'Util',
        href: '/announcements',
        icon: Megaphone,
        children: [
            { href: '/announcements', label: 'Novedades', shortLabel: 'News', icon: Megaphone },
            { href: '/nutrition', label: 'Nutricion', shortLabel: 'Nutri', icon: Salad },
        ],
    },
    {
        id: 'security',
        label: 'Seguridad y Admin',
        shortLabel: 'Admin',
        href: '/settings',
        icon: Settings,
        children: [
            { href: '/settings', label: 'Admin', icon: Settings },
            { href: '/audit', label: 'Auditoria', shortLabel: 'Audit', icon: FileText },
        ],
    },
]

type OrgNavProps = {
    slug: string
    workspaces: WorkspaceSummary[]
    org: {
        name: string
        logo_url: string | null
        primary_color: string | null
        myRole: string
        plan: string
        status: string
    }
}

function isActivePath(pathname: string, baseHref: string, href: string) {
    const full = `${baseHref}${href}`
    if (href === '') return pathname === baseHref
    return pathname === full || pathname.startsWith(`${full}/`)
}

function getActiveGroup(pathname: string, baseHref: string) {
    return NAV_GROUPS.find((group) => (
        isActivePath(pathname, baseHref, group.href) ||
        group.children.some((child) => isActivePath(pathname, baseHref, child.href))
    )) ?? NAV_GROUPS[0]
}

function OrgAvatar({ org }: Pick<OrgNavProps, 'org'>) {
    if (org.logo_url) {
        return (
            <Image
                src={org.logo_url}
                alt={org.name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-xl object-cover"
            />
        )
    }

    return (
        <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
            style={{ backgroundColor: org.primary_color ?? '#F59E0B' }}
        >
            {org.name.charAt(0).toUpperCase()}
        </div>
    )
}

export function OrgEnterpriseNav({ slug, org, workspaces }: OrgNavProps) {
    const pathname = usePathname()
    const baseHref = `/org/${slug}`
    const activeGroup = getActiveGroup(pathname, baseHref)

    return (
        <>
            <aside className="hidden w-72 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 md:flex">
                <div className="border-b border-zinc-800 p-4">
                    <Link
                        href={baseHref}
                        className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300"
                    >
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        EVA Enterprise
                    </Link>
                    <div className="flex items-center gap-3">
                        <OrgAvatar org={org} />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{org.name}</p>
                            <p className="text-[10px] capitalize text-zinc-500">{org.myRole.replace('_', ' ')}</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto p-3" aria-label="Enterprise navigation">
                    <div className="space-y-2">
                        {NAV_GROUPS.map((group) => {
                            const groupActive = activeGroup.id === group.id
                            const GroupIcon = group.icon
                            return (
                                <div
                                    key={group.id}
                                    className={cn(
                                        'rounded-2xl border p-1.5 transition-colors',
                                        groupActive
                                            ? 'border-amber-400/20 bg-amber-400/10'
                                            : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900/50'
                                    )}
                                >
                                    <Link
                                        href={`${baseHref}${group.href}`}
                                        className={cn(
                                            'flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 text-sm font-bold transition-colors',
                                            groupActive ? 'text-white' : 'text-zinc-400 hover:text-white'
                                        )}
                                    >
                                        <GroupIcon
                                            className={cn('h-4 w-4 shrink-0', groupActive ? 'text-amber-300' : 'text-zinc-500')}
                                            aria-hidden="true"
                                        />
                                        <span className="truncate">{group.label}</span>
                                    </Link>

                                    {group.children.length > 0 && (
                                        <div className="mt-1 space-y-0.5 pl-6">
                                            {group.children.map((child) => {
                                                const childActive = isActivePath(pathname, baseHref, child.href)
                                                const ChildIcon = child.icon
                                                return (
                                                    <Link
                                                        key={child.href}
                                                        href={`${baseHref}${child.href}`}
                                                        className={cn(
                                                            'flex min-h-8 items-center gap-2 rounded-lg px-2 text-xs font-semibold transition-colors',
                                                            childActive
                                                                ? 'bg-zinc-800 text-white'
                                                                : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200'
                                                        )}
                                                    >
                                                        <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                        <span className="truncate">{child.label}</span>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </nav>

                <div className="space-y-3 border-t border-zinc-800 p-4">
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                        <Building2 className="h-3 w-3" aria-hidden="true" />
                        <span className="capitalize">{org.plan}</span>
                        <span aria-hidden="true">/</span>
                        <span className={org.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}>
                            {org.status === 'active' ? 'Activo' : org.status}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex-1">
                            <WorkspaceSwitcher currentLabel={org.name} workspaces={workspaces} />
                        </div>
                        <OrgSignOutButton />
                    </div>
                </div>
            </aside>

            <header className="border-b border-zinc-800 bg-zinc-950 md:hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                    <OrgAvatar org={org} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{org.name}</p>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-300">Enterprise</p>
                    </div>
                    <WorkspaceSwitcher currentLabel={org.name} workspaces={workspaces} />
                    <OrgSignOutButton compact />
                </div>
                <nav className="grid grid-cols-3 gap-1 px-3 pb-2" aria-label="Enterprise mobile navigation">
                    {NAV_GROUPS.map((group) => {
                        const groupActive = activeGroup.id === group.id
                        const Icon = group.icon
                        return (
                            <Link
                                key={group.id}
                                href={`${baseHref}${group.href}`}
                                className={cn(
                                    'flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-[10px] font-bold transition-colors',
                                    groupActive
                                        ? 'border-amber-400/25 bg-amber-400/10 text-white'
                                        : 'border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:text-zinc-200'
                                )}
                            >
                                <Icon className={cn('h-4 w-4', groupActive && 'text-amber-300')} aria-hidden="true" />
                                <span className="max-w-full truncate">{group.shortLabel}</span>
                            </Link>
                        )
                    })}
                </nav>
                {activeGroup.children.length > 0 && (
                    <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label={`${activeGroup.label} subnavigation`}>
                        {activeGroup.children.map((child) => {
                            const childActive = isActivePath(pathname, baseHref, child.href)
                            const Icon = child.icon
                            return (
                                <Link
                                    key={child.href}
                                    href={`${baseHref}${child.href}`}
                                    className={cn(
                                        'flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors',
                                        childActive
                                            ? 'border-zinc-600 bg-zinc-800 text-white'
                                            : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                                    )}
                                >
                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                    {child.shortLabel ?? child.label}
                                </Link>
                            )
                        })}
                    </nav>
                )}
            </header>
        </>
    )
}
