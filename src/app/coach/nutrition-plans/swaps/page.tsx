import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { getCoachFoodSwapGroups } from '../_actions/food-swaps.actions'
import { SwapGroupsManager } from './_components/SwapGroupsManager'
import { searchCoachFoodLibrary } from '../_actions/food-library.actions'

export const metadata: Metadata = { title: 'Grupos de Intercambio' }

export default async function FoodSwapsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/coach/login')

  const [groups, { foods }] = await Promise.all([
    getCoachFoodSwapGroups(user.id),
    searchCoachFoodLibrary(user.id, { pageSize: 300, page: 0 }),
  ])

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 px-4 py-3.5 flex items-center gap-3">
        <Link
          href="/coach/nutrition-plans"
          className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-black tracking-tight">Grupos de Intercambio</h1>
          <p className="text-[10px] text-muted-foreground">Define grupos de alimentos equivalentes para tus alumnos</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 pb-28">
        <SwapGroupsManager
          coachId={user.id}
          initialGroups={groups}
          allFoods={(foods as Array<{ id: string; name: string; calories: number; protein_g: number; carbs_g: number; fats_g: number }>) ?? []}
        />
      </main>
    </div>
  )
}
