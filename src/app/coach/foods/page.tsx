import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import { getFoodLibrary } from '@/app/coach/nutrition-plans/_data/nutrition-coach.queries'
import { FoodBrowser } from './_components/FoodBrowser'
import { AddFoodSheet } from './_components/AddFoodSheet'

export default async function CoachFoodsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const coachId = user.id
  const { foods, total } = await getFoodLibrary(coachId, { page: 0, pageSize: 120 })

  return (
    <div className="max-w-6xl mx-auto animate-fade-in mb-24 md:mb-0 px-4 md:px-6 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/coach/dashboard"
            className="p-2 rounded-xl border border-border hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight flex items-center gap-2">
              <Apple className="w-6 h-6 text-primary shrink-0" />
              <span className="truncate">Alimentos</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Catálogo global y tus customs. También disponible en{' '}
              <Link href="/coach/nutrition-plans" className="text-primary font-semibold hover:underline">
                Nutrición → Alimentos
              </Link>
              .
            </p>
          </div>
        </div>
        <AddFoodSheet coachId={coachId} />
      </div>

      <FoodBrowser coachId={coachId} initialFoods={foods} totalFoods={total} />
    </div>
  )
}
