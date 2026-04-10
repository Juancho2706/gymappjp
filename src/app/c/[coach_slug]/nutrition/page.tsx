import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { getTodayInSantiago } from '@/lib/date-utils'
import {
  getActiveNutritionPlan,
  getNutritionLogForDate,
  getNutritionAdherence30d,
} from './_data/nutrition.queries'
import { NutritionShell } from './_components/NutritionShell'
import { EmptyNutritionState } from './_components/EmptyNutritionState'

export const metadata: Metadata = { title: 'Plan Nutricional' }

interface Props {
  params: Promise<{ coach_slug: string }>
}

export default async function ClientNutritionPage({ params }: Props) {
  const { coach_slug } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/c/${coach_slug}/login`)

  const { data: clientRow } = await supabase.from('clients').select('id').eq('id', user.id).maybeSingle()
  if (!clientRow) redirect(`/c/${coach_slug}/login`)

  const plan = await getActiveNutritionPlan(user.id)
  if (!plan) {
    return <EmptyNutritionState coachSlug={coach_slug} />
  }

  const { iso: today } = getTodayInSantiago()
  const [todayLog, adherence] = await Promise.all([
    getNutritionLogForDate(user.id, plan.id, today),
    getNutritionAdherence30d(user.id, plan.id),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div
        className="fixed top-0 right-0 w-72 h-72 opacity-[0.06] blur-3xl rounded-full pointer-events-none"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 px-4 py-3.5 flex items-center gap-3">
        <Link
          href={`/c/${coach_slug}/dashboard`}
          className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-black tracking-tight text-foreground">Plan Nutricional</h1>
          <p className="text-[10px] text-muted-foreground font-medium">{plan.name}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-5 relative z-0">
        {plan.instructions && (
          <details className="bg-muted/30 border border-border rounded-2xl">
            <summary className="px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground cursor-pointer list-none flex items-center justify-between">
              Indicaciones del coach
              <span className="text-muted-foreground/50">▼</span>
            </summary>
            <div className="px-4 pb-4">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {plan.instructions}
              </p>
            </div>
          </details>
        )}

        <NutritionShell
          plan={plan}
          initialLog={todayLog as Record<string, unknown> | null}
          adherence={adherence}
          userId={user.id}
          coachSlug={coach_slug}
          today={today}
        />
      </main>
    </div>
  )
}
