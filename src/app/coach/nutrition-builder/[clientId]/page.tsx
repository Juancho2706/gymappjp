import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Apple } from 'lucide-react'
import type { Client } from '@/lib/database.types'
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
        <div className="p-8 max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href={`/coach/clients/${clientId}`}
                    className="p-2 rounded-xl border border-border hover:bg-muted transition-colors">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Apple className="w-5 h-5 text-primary" />
                        Plan Nutricional
                    </h1>
                    <p className="text-sm text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px] sm:max-w-none">
                        Para {client.full_name}
                    </p>
                </div>
            </div>

            <div className="bg-card border border-border rounded-2xl shadow-sm p-6 sm:p-8">
                <NutritionForm clientId={clientId} coachId={user.id} />
            </div>
        </div>
    )
}
