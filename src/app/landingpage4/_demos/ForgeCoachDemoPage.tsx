'use client'

import { useCallback, useMemo, useState } from 'react'
import { Apple, ClipboardList, Dumbbell, LayoutDashboard, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEMO_ACTIVITY_FEED, DEMO_BRAND, DEMO_CLIENT_ROWS, DEMO_COACH, DEMO_NAV_COACH, DEMO_PROGRAMS } from './forge-demo-mocks'
import { ForgeDemoChrome } from './ForgeDemoChrome'

const icons = [LayoutDashboard, Users, ClipboardList, Dumbbell, Apple, Settings] as const

type DemoCoachView = 'dashboard' | 'clients' | 'clientDetail' | 'programs' | 'builder' | 'nutritionHub' | 'brand'

const NAV_TO_VIEW: readonly DemoCoachView[] = ['dashboard', 'clients', 'programs', 'builder', 'nutritionHub', 'brand'] as const

export function ForgeCoachDemoPage() {
    const [view, setView] = useState<DemoCoachView>('dashboard')
    const [detailClient, setDetailClient] = useState<(typeof DEMO_CLIENT_ROWS)[number] | null>(null)

    const breadcrumb = useMemo(() => {
        const labels: Record<DemoCoachView, string> = {
            dashboard: 'Dashboard',
            clients: 'Clientes · Directorio',
            clientDetail: `Cliente · ${detailClient?.name ?? 'Detalle'}`,
            programs: 'Programas · Biblioteca',
            builder: 'Constructor · Semana',
            nutritionHub: 'Nutrición · Hub',
            brand: 'Ajustes · Mi marca',
        }
        return `Coach · ${labels[view]}`
    }, [view, detailClient])

    const goNav = useCallback((i: number) => {
        setDetailClient(null)
        setView(NAV_TO_VIEW[i] ?? 'dashboard')
    }, [])

    const openClient = useCallback((row: (typeof DEMO_CLIENT_ROWS)[number]) => {
        setDetailClient(row)
        setView('clientDetail')
    }, [])

    return (
        <div className="flex min-h-[100dvh] flex-col bg-[var(--forge-bg)] md:flex-row">
            <div className="forge-font-mono flex gap-0 overflow-x-auto border-b border-[var(--forge-border)] bg-[var(--forge-surface)] md:hidden">
                {DEMO_NAV_COACH.map((item, i) => {
                    const Icon = icons[i] ?? LayoutDashboard
                    const active =
                        (view === 'clientDetail' && i === 1) || (NAV_TO_VIEW[i] === view && view !== 'clientDetail')
                    return (
                        <button
                            key={item.label}
                            type="button"
                            onClick={() => goNav(i)}
                            className={cn(
                                'flex min-w-[4.5rem] flex-col items-center gap-0.5 border-r border-[var(--forge-border)] px-2 py-3 text-[8px] font-semibold uppercase tracking-wide last:border-r-0',
                                active ? 'text-[var(--forge-accent)]' : 'text-[var(--forge-muted)]'
                            )}
                        >
                            <Icon className="size-4" aria-hidden />
                            <span className="truncate">{item.short}</span>
                        </button>
                    )
                })}
            </div>
            <aside className="hidden w-56 flex-shrink-0 flex-col border-r border-[var(--forge-border)] bg-[var(--forge-surface)] md:flex">
                <div className="border-b border-[var(--forge-border)] px-4 py-4">
                    <p className="forge-font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--forge-muted)]">Marca</p>
                    <p className="forge-font-display truncate text-sm font-extrabold text-[var(--forge-ink)]">{DEMO_COACH.brandName}</p>
                    <p className="forge-font-mono mt-1 truncate text-[10px] text-[var(--forge-muted)]">{DEMO_COACH.fullName}</p>
                </div>
                <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Navegación demo coach">
                    {DEMO_NAV_COACH.map((item, i) => {
                        const Icon = icons[i] ?? LayoutDashboard
                        const v = NAV_TO_VIEW[i] ?? 'dashboard'
                        const active = (view === 'clientDetail' && i === 1) || (v === view && view !== 'clientDetail')
                        return (
                            <button
                                key={item.label}
                                type="button"
                                onClick={() => goNav(i)}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'forge-font-mono flex w-full cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[11px] font-semibold transition-colors',
                                    active
                                        ? 'text-[var(--forge-accent)]'
                                        : 'text-[var(--forge-muted)] hover:bg-[var(--forge-surface-alt)] hover:text-[var(--forge-ink)]'
                                )}
                                style={
                                    active
                                        ? {
                                              backgroundColor: 'var(--forge-accent-bg)',
                                              boxShadow: 'inset 3px 0 0 0 var(--forge-accent)',
                                          }
                                        : undefined
                                }
                            >
                                <Icon className="size-4 shrink-0" aria-hidden />
                                <span className="truncate">{item.label}</span>
                            </button>
                        )
                    })}
                </nav>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
                <ForgeDemoChrome title="Vista coach" subtitle="Interfaz de demostración" breadcrumb={breadcrumb} />
                <p className="forge-font-mono border-b border-[var(--forge-border)] bg-[var(--forge-accent-bg)] px-3 py-2 text-center text-[9px] uppercase tracking-wider text-[var(--forge-accent)]">
                    Vitrina de interfaz — no es tu cuenta ni datos reales.
                </p>
                <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-8">
                    {view === 'dashboard' ? <CoachDashboard /> : null}
                    {view === 'clients' ? <CoachClients onOpen={openClient} /> : null}
                    {view === 'clientDetail' && detailClient ? <CoachClientDetail client={detailClient} onBack={() => setView('clients')} /> : null}
                    {view === 'programs' ? <CoachPrograms /> : null}
                    {view === 'builder' ? <CoachBuilder /> : null}
                    {view === 'nutritionHub' ? <CoachNutritionHub /> : null}
                    {view === 'brand' ? <CoachBrand /> : null}
                </main>
            </div>
        </div>
    )
}

function CoachDashboard() {
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">Resumen operativo (datos de ejemplo).</p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {(
                    [
                        { label: 'Alumnos activos', value: String(DEMO_COACH.activeClients) },
                        { label: 'Alertas', value: String(DEMO_COACH.alerts) },
                        { label: 'Sesiones semana', value: String(DEMO_COACH.sessionsThisWeek) },
                    ] as const
                ).map((c) => (
                    <div
                        key={c.label}
                        className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4 shadow-[3px_3px_0_var(--forge-ink)]"
                    >
                        <p className="forge-font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--forge-muted)]">{c.label}</p>
                        <p className="forge-font-display mt-2 text-3xl font-black text-[var(--forge-ink)]">{c.value}</p>
                    </div>
                ))}
            </div>

            <div className="mt-8 rounded-[12px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                <p className="forge-font-mono text-[10px] font-semibold uppercase tracking-wider text-[var(--forge-muted)]">Actividad reciente</p>
                <ul className="mt-3 space-y-2 text-sm text-[var(--forge-ink-2)]">
                    {DEMO_ACTIVITY_FEED.map((row) => (
                        <li key={row.text} className="flex justify-between border-b border-[var(--forge-border)] py-2 last:border-b-0">
                            <span>{row.text}</span>
                            <span className="forge-font-mono text-[10px] text-[var(--forge-muted)]">{row.when}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    )
}

function CoachClients({ onOpen }: { onOpen: (row: (typeof DEMO_CLIENT_ROWS)[number]) => void }) {
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Clientes</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">Directorio con datos ficticios.</p>
            <div className="mt-6 overflow-hidden rounded-[12px] border border-[var(--forge-border)] bg-[var(--forge-surface)]">
                <div className="forge-font-mono flex border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--forge-muted)]">
                    <span className="flex-1">Alumno</span>
                    <span className="w-16 text-center">Adh.</span>
                    <span className="w-20 text-right">Acción</span>
                </div>
                {DEMO_CLIENT_ROWS.map((row) => (
                    <div key={row.name} className="flex items-center border-b border-[var(--forge-border)] px-3 py-2.5 text-sm last:border-b-0">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] forge-font-mono text-[9px] font-bold">
                                {row.initials}
                            </span>
                            <span className="truncate font-medium text-[var(--forge-ink)]">{row.name}</span>
                        </div>
                        <span className="w-16 text-center font-bold text-[var(--forge-ink)]">{row.adherence}%</span>
                        <div className="w-20 text-right">
                            <button
                                type="button"
                                onClick={() => onOpen(row)}
                                className="forge-font-mono rounded-md border border-[var(--forge-accent)] bg-[var(--forge-accent-bg)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--forge-accent)] hover:bg-[var(--forge-accent)]/15"
                            >
                                Ver
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    )
}

function CoachClientDetail({ client, onBack }: { client: (typeof DEMO_CLIENT_ROWS)[number]; onBack: () => void }) {
    const tabs = ['Overview', 'Plan', 'Nutrición'] as const
    return (
        <>
            <button
                type="button"
                onClick={onBack}
                className="forge-font-mono mb-4 text-[11px] font-bold uppercase tracking-wide text-[var(--forge-accent)] hover:underline"
            >
                ← Volver al directorio
            </button>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Perfil alumno</p>
                    <h1 className="forge-font-display text-2xl font-black text-[var(--forge-ink)]">{client.name}</h1>
                    <p className="forge-font-mono mt-1 text-xs text-[var(--forge-muted)]">Adherencia {client.adherence}% · último log {client.lastLog}</p>
                </div>
                <span className="forge-font-mono rounded-full border border-[var(--forge-border)] px-3 py-1 text-[10px] text-[var(--forge-muted)]">
                    Vista demo
                </span>
            </div>
            <div className="mt-6 flex gap-1 border-b border-[var(--forge-border)]">
                {tabs.map((t, i) => (
                    <span
                        key={t}
                        className={cn(
                            'forge-font-mono border-b-2 px-3 py-2 text-[11px] font-semibold',
                            i === 0 ? 'border-[var(--forge-accent)] text-[var(--forge-ink)]' : 'border-transparent text-[var(--forge-muted)]'
                        )}
                    >
                        {t}
                    </span>
                ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                    <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Resumen</p>
                    <p className="mt-2 text-sm text-[var(--forge-ink-2)]">
                        Check-ins, plan activo y nutrición aparecen aquí en la app real. Esta vitrina solo muestra el layout.
                    </p>
                </div>
                <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-4">
                    <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Atención</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--forge-ink)]">{client.attention === 'watch' ? 'Revisar esta semana' : 'Sin alertas'}</p>
                </div>
            </div>
        </>
    )
}

function CoachPrograms() {
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Biblioteca de programas</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">Plantillas y duplicación con snapshot en el producto real.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {DEMO_PROGRAMS.map((p) => (
                    <div
                        key={p.name}
                        className={cn(
                            'rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4 shadow-[3px_3px_0_var(--forge-ink)]',
                            p.active && 'border-[var(--forge-accent)]/50 bg-[var(--forge-accent-bg)]/30'
                        )}
                    >
                        {p.active ? (
                            <span className="forge-font-mono mb-2 inline-block rounded border border-[var(--forge-accent)] px-2 py-0.5 text-[8px] font-bold uppercase text-[var(--forge-accent)]">
                                Activo
                            </span>
                        ) : null}
                        <p className="font-bold text-[var(--forge-ink)]">{p.name}</p>
                        <p className="forge-font-mono mt-1 text-[10px] text-[var(--forge-muted)]">{p.weeks} semanas</p>
                    </div>
                ))}
            </div>
        </>
    )
}

function CoachBuilder() {
    const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Constructor</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">WeeklyPlanBuilder con DnD en producción; aquí solo layout.</p>
            <div className="mt-6 flex gap-1 overflow-x-auto pb-2">
                {days.map((d, i) => (
                    <span
                        key={d}
                        className={cn(
                            'forge-font-mono shrink-0 rounded-md border px-3 py-2 text-[11px] font-bold',
                            i === 2 ? 'border-[var(--forge-ink)] bg-[var(--forge-ink)] text-[var(--forge-bg)]' : 'border-[var(--forge-border)] bg-[var(--forge-surface)] text-[var(--forge-muted)]'
                        )}
                    >
                        {d}
                    </span>
                ))}
            </div>
            <div className="space-y-2">
                {['Press banca · 4×8', 'Remo · 3×10'].map((line) => (
                    <div key={line} className="relative rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] py-3 ps-4 pe-3">
                        <div className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-sm bg-[var(--forge-accent)]" />
                        <p className="ps-2 text-sm font-semibold text-[var(--forge-ink)]">{line}</p>
                    </div>
                ))}
            </div>
        </>
    )
}

function CoachNutritionHub() {
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Nutrición coach</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">Hub, plantillas y tablero de planes activos.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
                <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                    <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Planes activos</p>
                    <p className="forge-font-display mt-2 text-3xl font-black text-[var(--forge-ink)]">12</p>
                </div>
                <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-4">
                    <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Plantillas</p>
                    <p className="forge-font-display mt-2 text-3xl font-black text-[var(--forge-ink)]">8</p>
                </div>
            </div>
        </>
    )
}

function CoachBrand() {
    return (
        <>
            <h1 className="forge-font-display text-2xl font-black tracking-tight text-[var(--forge-ink)]">Mi marca</h1>
            <p className="mt-1 text-sm text-[var(--forge-ink-2)]">Logo, color y URL pública del espacio del alumno.</p>
            <div className="mt-8 max-w-lg rounded-[12px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-5">
                <label className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Color</label>
                <div className="mt-2 flex items-center gap-3">
                    <span className="size-10 rounded-lg border-2 border-[var(--forge-border)]" style={{ backgroundColor: DEMO_BRAND.hexColor }} />
                    <span className="forge-font-mono rounded border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-3 py-2 text-sm">{DEMO_BRAND.hexColor}</span>
                </div>
                <label className="forge-font-mono mt-6 block text-[9px] font-bold uppercase text-[var(--forge-muted)]">Slug público</label>
                <p className="forge-font-mono mt-1 text-sm text-[var(--forge-accent)]">/c/{DEMO_BRAND.slug}</p>
            </div>
        </>
    )
}
