import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
import { NutritionForm } from './NutritionForm'

export default async function NutritionBuilderPage({
    params,
    searchParams
}: {
    params: Promise<{ clientId: string }>
    searchParams: Promise<{ planId?: string }>
}) {
    const { clientId } = await params
    const { planId } = await searchParams
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const [clientRes, planRes] = await Promise.all([
        supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('coach_id', user.id)
            .maybeSingle(),
        planId ? supabase
            .from('nutrition_plans')
            .select(`
                *,
                nutrition_meals (
                    *,
                    food_items (
                        *,
                        foods (*)
                    )
                )
            `)
            .eq('id', planId)
            .maybeSingle() : Promise.resolve({ data: null })
    ])

    const rawClient = clientRes.data
    const initialData = planRes.data

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Pick<Client, 'id' | 'full_name' | 'email'>

    return (
        <div className="max-w-3xl mx-auto animate-fade-in mb-24 md:mb-0">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 md:mb-8">
                <Link href={`/coach/clients/${clientId}`}
                    className="p-2 rounded-xl border border-border hover:bg-muted transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Apple className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">{initialData ? 'Editar Plan Nutricional' : 'Plan Nutricional'}</span>
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">
                        Para {client.full_name}
                    </p>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-8">
                <NutritionForm clientId={clientId} coachId={user.id} initialData={initialData} />
            </div>
        </div>
    )
}
