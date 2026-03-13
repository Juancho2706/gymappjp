import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import type { Tables } from '@/lib/database.types'

type Client = Tables<'clients'>
import { NutritionForm } from './NutritionForm'

export default async function NutritionBuilderPage({
    params
}: {
    params: Promise<{ clientId: string }>
}) {
    const { clientId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: rawClient } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

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
                        <span className="truncate">Plan Nutricional</span>
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">
                        Para {client.full_name}
                    </p>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-8">
                <NutritionForm clientId={clientId} coachId={user.id} />
            </div>
        </div>
    )
}
