import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import {
    BadgeCheck,
    CheckCircle2,
    Eye,
    Loader2,
    Lock,
    MonitorSmartphone,
    Palette,
    Smartphone,
    Sparkles,
} from 'lucide-react'
import { getOrgBySlug } from '../_data/org.queries'
import { BrandCenterActions } from './_components/BrandCenterActions'

export const metadata: Metadata = { title: 'Brand Center' }

interface Props {
    params: Promise<{ slug: string }>
}

const BRAND_SURFACES = [
    'Enterprise dashboard',
    'Coach app normal',
    'Alumno PWA',
    'Login y loaders',
    'PWA manifest futuro',
]

const LOADER_OPTIONS = [
    { name: 'Logo pulse', status: 'MVP' },
    { name: 'Progress ring', status: 'MVP' },
    { name: 'Skeleton branded', status: 'Next' },
]

function getReadableColor(color: string | null) {
    return color && /^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#F59E0B'
}

export default async function OrgBrandPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const primaryColor = getReadableColor(org.primary_color)
    const compactName = org.name.length > 18 ? `${org.name.slice(0, 18)}...` : org.name

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8 md:py-8">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl shadow-black/20 md:p-7">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,0.20),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(14,165,233,0.10),transparent_30%)]"
                    />
                    <div className="relative grid gap-7 lg:grid-cols-[1fr_420px] lg:items-end">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-300">
                                <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                                White-label command
                            </span>
                            <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
                                Brand Center
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 md:text-base">
                                Define la marca que veran el owner, staff enterprise, coaches creados por la empresa y alumnos. Guarda un draft y publicalo a coaches enterprise sin herramientas externas.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/75 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Brand source</p>
                            <div className="mt-4 flex items-center gap-3">
                                <div
                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg"
                                    style={{ backgroundColor: primaryColor, boxShadow: `0 18px 42px ${primaryColor}33` }}
                                >
                                    {org.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-base font-black text-white">{org.name}</p>
                                    <p className="mt-1 text-xs text-zinc-500">
                                        {org.logo_url ? 'Logo configurado en organizacion' : 'Fallback activo hasta cargar logo'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-amber-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Preview matrix</h2>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                            La misma identidad debe sentirse consistente, pero adaptarse al contexto de cada app.
                        </p>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Coach app</span>
                                    <Lock className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                </div>
                                <div className="mt-5 flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl" style={{ backgroundColor: primaryColor }} />
                                    <div>
                                        <p className="text-sm font-black text-white">{compactName}</p>
                                        <p className="text-xs text-zinc-500">Mi marca y Billing ocultos</p>
                                    </div>
                                </div>
                                <div className="mt-5 h-2 rounded-full bg-zinc-800">
                                    <div className="h-2 w-2/3 rounded-full" style={{ backgroundColor: primaryColor }} />
                                </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Alumno PWA</span>
                                    <Smartphone className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                                </div>
                                <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
                                    <div className="flex items-center gap-2">
                                        <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: primaryColor }} />
                                        <div>
                                            <p className="text-xs font-black text-white">{compactName}</p>
                                            <p className="text-[11px] text-zinc-500">Entrenamiento de hoy</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-1">
                                        <span className="h-9 rounded-lg bg-zinc-800" />
                                        <span className="h-9 rounded-lg" style={{ backgroundColor: primaryColor }} />
                                        <span className="h-9 rounded-lg bg-zinc-800" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Enterprise</span>
                                    <MonitorSmartphone className="h-4 w-4 text-sky-300" aria-hidden="true" />
                                </div>
                                <div className="mt-5 space-y-2">
                                    <div className="h-3 w-24 rounded-full bg-zinc-800" />
                                    <div className="h-8 w-32 rounded-xl" style={{ backgroundColor: primaryColor }} />
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="h-14 rounded-xl bg-zinc-900" />
                                        <div className="h-14 rounded-xl bg-zinc-900" />
                                        <div className="h-14 rounded-xl bg-zinc-900" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Loader</span>
                                    <Loader2 className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                </div>
                                <div className="mt-6 flex items-center justify-center">
                                    <div className="relative flex h-20 w-20 items-center justify-center">
                                        <div className="absolute inset-0 rounded-full border border-zinc-800" />
                                        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-amber-300" />
                                        <div
                                            className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            {org.name.charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
                                <h2 className="text-lg font-black text-white">Brand controls MVP</h2>
                            </div>
                            <div className="mt-5 grid gap-3 md:grid-cols-2">
                                {[
                                    ['Logo principal', org.logo_url ? 'Configurado' : 'Pendiente'],
                                    ['Color primario', primaryColor],
                                    ['Loader', 'Logo pulse + ring'],
                                    ['Modo', 'Dark enterprise first'],
                                    ['Coach lock', 'Mi marca/Billing ocultos'],
                                    ['Alumno app', 'Brand heredado de org'],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p>
                                        <p className="mt-2 text-sm font-bold text-zinc-100">{value}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <h2 className="text-lg font-black text-white">Editar y publicar</h2>
                            <p className="mt-2 text-sm leading-6 text-zinc-500">
                                Draft usa `organizations`. Publicar sincroniza coaches enterprise activos con `coaches.brand_name`, colores, logo y loader.
                            </p>
                            <div className="mt-5">
                                <BrandCenterActions
                                    orgSlug={slug}
                                    defaultName={org.name}
                                    defaultColor={primaryColor}
                                    logoUrl={org.logo_url}
                                />
                            </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                            <h2 className="text-lg font-black text-white">Loader library</h2>
                            <div className="mt-4 space-y-3">
                                {LOADER_OPTIONS.map((option) => (
                                    <div key={option.name} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                                                <Loader2 className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <p className="text-sm font-bold text-zinc-100">{option.name}</p>
                                        </div>
                                        <span className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">
                                            {option.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[1fr_0.75fr]">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                        <div className="flex items-center gap-2">
                            <BadgeCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                            <h2 className="text-lg font-black text-white">Propagation rules</h2>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {BRAND_SURFACES.map((surface) => (
                                <div key={surface} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                                    <p className="text-sm leading-5 text-zinc-300">{surface}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-5">
                        <h2 className="text-lg font-black text-white">Estado de esta fase</h2>
                        <p className="mt-3 text-sm leading-6 text-amber-100/80">
                            Draft, upload y publish inicial ya funcionan con el modelo existente. Queda pendiente modelo dedicado `organization_branding` si necesitamos versionado, rollback y publish avanzado.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    )
}
