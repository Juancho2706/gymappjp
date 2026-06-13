import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Dumbbell, ChevronDown } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { getWorkoutHistoryDayCounts } from '@/app/c/[coach_slug]/dashboard/_data/dashboard.queries'
import { WorkoutHistoryList } from './_components/WorkoutHistoryList'
import { getWorkoutHistoryUser } from './_data/workout-history.queries'
import { getClientBasePath } from '@/lib/client/base-path'

export const metadata: Metadata = { title: 'Historial de entrenos' }

const DEFAULT_DAYS = 90
const EXTENDED_DAYS = 180

interface Props {
    params: Promise<{ coach_slug: string }>
    searchParams: Promise<{ range?: string }>
}

export default async function ClientWorkoutHistoryPage({ params, searchParams }: Props) {
    const { coach_slug } = await params
    const { range } = await searchParams
    const base = await getClientBasePath(coach_slug)
    const { user, hasClientRow } = await getWorkoutHistoryUser()
    if (!user) redirect(`${base}/login`)
    if (!hasClientRow) redirect(`${base}/login`)

    const extended = range === String(EXTENDED_DAYS)
    const daysBack = extended ? EXTENDED_DAYS : DEFAULT_DAYS
    const monthsLabel = extended ? '6 meses' : '3 meses'
    const items = await getWorkoutHistoryDayCounts(user.id, daysBack)

    return (
        <div className="min-h-dvh bg-background">
            <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/10 bg-background/95 px-4 py-3 pt-safe backdrop-blur-xl">
                <Link
                    href={`${base}/dashboard`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    aria-label="Volver al inicio"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' }}
                >
                    <Dumbbell className="h-5 w-5" style={{ color: 'var(--theme-primary)' }} />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="font-display text-lg font-bold text-foreground">Historial de entrenos</h1>
                    <p className="text-[11px] text-muted-foreground">Días con series registradas (últimos {monthsLabel})</p>
                </div>
            </header>

            <main className="relative z-0 mx-auto max-w-5xl px-4 py-4 pb-8 sm:px-6">
                {items.length === 0 ? (
                    <p className="rounded-2xl border border-border/40 bg-card/40 px-4 py-8 text-center text-sm text-muted-foreground">
                        Aún no hay series registradas en este periodo. Cuando completes entrenos, aparecerán aquí.
                    </p>
                ) : (
                    <>
                        <GlassCard className="overflow-hidden">
                            <WorkoutHistoryList items={items} />
                        </GlassCard>
                        {!extended && (
                            <div className="mt-4 flex justify-center">
                                <Link
                                    href={`${base}/workout-history?range=${EXTENDED_DAYS}`}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                                >
                                    Ver últimos 6 meses
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Link>
                            </div>
                        )}
                        <p className="mt-4 px-1 text-center text-[10px] leading-relaxed text-muted-foreground">
                            Solo ves tus propios registros. {extended ? 'Mostrando los últimos 6 meses.' : 'Mostrando los últimos 3 meses.'}
                        </p>
                    </>
                )}
            </main>
        </div>
    )
}
