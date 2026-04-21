'use client'

import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import {
    Apple,
    ClipboardList,
    Dumbbell,
    Flame,
    Home,
    LayoutDashboard,
    MoreHorizontal,
    Settings,
    Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEMO_CLIENT_ROWS, DEMO_COACH, DEMO_STUDENT } from '../_demos/forge-demo-mocks'

const coachNavIcons = [LayoutDashboard, Users, ClipboardList, Dumbbell, Apple, Settings] as const

function WindowDots() {
    return (
        <div className="flex gap-1.5" aria-hidden>
            <span className="size-2 rounded-full bg-[var(--forge-border-strong)]" />
            <span className="size-2 rounded-full bg-[var(--forge-border-strong)]" />
            <span className="size-2 rounded-full bg-[var(--forge-border-strong)]" />
        </div>
    )
}

export function ForgeHeroAppShowcase({ className }: { className?: string }) {
    const reduce = useReducedMotion()

    return (
        <div className={cn('flex flex-col gap-4', className)}>
            <motion.div
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="relative mx-auto w-full max-w-lg lg:max-w-none"
            >
                {/* Laptop / desktop frame */}
                <div
                    className="forge-brutal-shadow relative z-[1] overflow-hidden rounded-xl border-2 border-[var(--forge-ink)] bg-[var(--forge-surface)] shadow-[8px_8px_0_var(--forge-ink)] md:rounded-[14px]"
                    aria-hidden
                >
                    <div className="flex items-center gap-2 border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-3 py-2">
                        <WindowDots />
                        <p className="forge-font-mono min-w-0 flex-1 truncate text-center text-[9px] font-semibold uppercase tracking-widest text-[var(--forge-muted)]">
                            coach.eva.app
                        </p>
                        <span className="forge-font-mono shrink-0 rounded border border-[var(--forge-border)] px-1.5 py-0.5 text-[8px] text-[var(--forge-muted)]">
                            7d {DEMO_COACH.sessionsThisWeek}
                        </span>
                    </div>
                    <div className="flex min-h-[200px] sm:min-h-[220px]">
                        <aside className="flex w-9 shrink-0 flex-col items-center gap-2 border-r border-[var(--forge-border)] bg-[var(--forge-surface-alt)] py-2 sm:w-11">
                            {coachNavIcons.map((Icon, i) => (
                                <Icon
                                    key={i}
                                    className={cn('size-3.5 sm:size-4', i === 0 ? 'text-[var(--forge-accent)]' : 'text-[var(--forge-muted)]')}
                                    aria-hidden
                                />
                            ))}
                        </aside>
                        <div className="min-w-0 flex-1 p-2 sm:p-3">
                            <p className="forge-font-mono text-[8px] font-bold uppercase tracking-wider text-[var(--forge-muted)]">Dashboard</p>
                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                                {(
                                    [
                                        { k: 'Activos', v: DEMO_COACH.activeClients },
                                        { k: 'Alertas', v: DEMO_COACH.alerts },
                                        { k: 'Sesiones', v: DEMO_COACH.sessionsThisWeek },
                                    ] as const
                                ).map((c) => (
                                    <div
                                        key={c.k}
                                        className="rounded-md border border-[var(--forge-border)] bg-[var(--forge-bg)] px-1.5 py-1.5 text-center sm:px-2"
                                    >
                                        <p className="forge-font-mono text-[7px] uppercase text-[var(--forge-muted)]">{c.k}</p>
                                        <p className="forge-font-display text-sm font-black text-[var(--forge-ink)] sm:text-base">{c.v}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-2 overflow-hidden rounded-md border border-[var(--forge-border)]">
                                <div className="forge-font-mono flex border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-2 py-1 text-[7px] font-semibold uppercase text-[var(--forge-muted)]">
                                    <span className="flex-1">Alumno</span>
                                    <span className="w-10 text-center">%</span>
                                    <span className="w-12 text-right">Log</span>
                                </div>
                                {DEMO_CLIENT_ROWS.slice(0, 3).map((row) => (
                                    <div
                                        key={row.name}
                                        className="flex items-center gap-1.5 border-b border-[var(--forge-border)] px-2 py-1 text-[10px] last:border-b-0 sm:text-[11px]"
                                    >
                                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] forge-font-mono text-[8px] font-bold text-[var(--forge-ink)]">
                                            {row.initials}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate font-medium text-[var(--forge-ink)]">{row.name}</span>
                                        <span className="w-10 text-center font-bold text-[var(--forge-ink)]">{row.adherence}</span>
                                        <span className="forge-font-mono w-12 text-right text-[8px] text-[var(--forge-muted)]">{row.lastLog}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Phone — overlapping front */}
                <motion.div
                    initial={reduce ? false : { opacity: 0, y: 20, rotate: -4 }}
                    animate={reduce ? undefined : { opacity: 1, y: 0, rotate: -3 }}
                    transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                        'forge-brutal-shadow relative z-[2] -mt-16 ml-0 w-[72%] max-w-[240px] overflow-hidden rounded-[14px] border-2 border-[var(--forge-ink)] bg-[var(--forge-surface)] sm:-mt-20 sm:w-[55%]',
                        'md:absolute md:bottom-2 md:left-0 md:mt-0 md:w-[38%] md:max-w-[220px]'
                    )}
                    aria-hidden
                >
                    <div className="flex items-center justify-between border-b border-[var(--forge-border)] bg-[var(--forge-surface-alt)] px-2 py-1.5">
                        <WindowDots />
                        <MoreHorizontal className="size-3.5 text-[var(--forge-muted)]" aria-hidden />
                    </div>
                    <div className="border-b border-[var(--forge-border)] px-2.5 py-2">
                        <p className="forge-font-mono text-[7px] font-bold uppercase tracking-widest text-[var(--forge-muted)]">{DEMO_STUDENT.brandName}</p>
                        <p className="forge-font-display truncate text-sm font-extrabold text-[var(--forge-ink)]">Hola, {DEMO_STUDENT.greetingName}</p>
                        <div className="mt-1 flex gap-1">
                            <span className="forge-font-mono flex items-center gap-0.5 rounded-full border border-[var(--forge-border)] px-1.5 py-0.5 text-[7px] font-bold text-[var(--forge-warning)]">
                                <Flame className="size-2.5" />
                                {DEMO_STUDENT.streak}d
                            </span>
                            <span className="forge-font-mono rounded border border-[var(--forge-accent)] px-1.5 py-0.5 text-[7px] font-bold text-[var(--forge-accent)]">
                                {DEMO_STUDENT.checkInLabel}
                            </span>
                        </div>
                    </div>
                    <div className="space-y-2 p-2">
                        <div className="relative overflow-hidden rounded-lg border border-[var(--forge-border)] bg-[var(--forge-bg)] p-2">
                            <div className="absolute bottom-2 left-0 top-2 w-[2px] rounded-r-sm bg-[var(--forge-ink)]" />
                            <div className="flex items-start justify-between pl-2">
                                <div className="flex size-7 items-center justify-center rounded-md border border-[var(--forge-accent)] bg-[var(--forge-accent-bg)]">
                                    <Dumbbell className="size-3.5 text-[var(--forge-accent)]" />
                                </div>
                                <Home className="size-3 text-[var(--forge-muted)]" aria-hidden />
                            </div>
                            <p className="forge-font-mono mt-1 pl-2 text-[7px] text-[var(--forge-muted)]">Hoy</p>
                            <p className="pl-2 text-xs font-bold leading-tight text-[var(--forge-ink)]">{DEMO_STUDENT.workoutTitle}</p>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <div className="forge-font-mono flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[var(--forge-border)] pt-3 text-[9px] uppercase tracking-wider text-[var(--forge-muted)] md:justify-start">
                <span>
                    <span className="text-[var(--forge-ink)]">4</span> módulos
                </span>
                <span className="hidden sm:inline">·</span>
                <span>Next 16</span>
                <span className="hidden sm:inline">·</span>
                <span>B2B2C</span>
            </div>

            <div className="flex flex-wrap justify-center gap-3 md:justify-start">
                <Link
                    href="/landingpage4/pruebavistacoach"
                    className="forge-font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--forge-accent)] underline-offset-4 hover:underline"
                >
                    Ver demo coach
                </Link>
                <Link
                    href="/landingpage4/pruebavistaalumno"
                    className="forge-font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--forge-accent)] underline-offset-4 hover:underline"
                >
                    Ver demo alumno
                </Link>
            </div>
        </div>
    )
}
