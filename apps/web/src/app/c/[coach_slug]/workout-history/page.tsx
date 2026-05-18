import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Dumbbell } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { buildWorkoutLogDaySummaries, getWorkoutHistoryLogsFull } from '@/app/c/[coach_slug]/dashboard/_data/dashboard.queries'
import { WorkoutLogItems } from '@/app/c/[coach_slug]/dashboard/_components/history/WorkoutLogItem'

export const metadata: Metadata = { title: 'Historial de entrenos' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientWorkoutHistoryPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    const { data: client } = await supabase.from('clients').select('id').eq('id', user.id).maybeSingle()
    if (!client) redirect(`/c/${coach_slug}/login`)

    const logs = await getWorkoutHistoryLogsFull(user.id)
    const items = buildWorkoutLogDaySummaries(logs)

    return (
        <div className="min-h-dvh bg-background">
            <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/10 bg-background/95 px-4 py-3 pt-safe backdrop-blur-xl">
                <Link
                    href={`/c/${coach_slug}/dashboard`}
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
                    <p className="text-[11px] text-muted-foreground">Días con series registradas (últimos 12 meses)</p>
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
                            <WorkoutLogItems items={items} />
                        </GlassCard>
                        <p className="mt-4 px-1 text-center text-[10px] leading-relaxed text-muted-foreground">
                            Solo ves tus propios registros. Máximo 12 meses hacia atrás y hasta 8000 series cargadas en esta vista.
                        </p>
                    </>
                )}
            </main>
        </div>
    )
}
