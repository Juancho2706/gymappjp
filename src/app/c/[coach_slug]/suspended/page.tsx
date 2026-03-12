import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AlertCircle, LogOut } from 'lucide-react'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function SuspendedPage({ params }: Props) {
    const { coach_slug } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    const { data: rawCoachData } = await supabase
        .from('coaches')
        .select('brand_name, whatsapp')
        .eq('slug', coach_slug)
        .maybeSingle()

    const coachData = rawCoachData as { brand_name: string; whatsapp: string | null } | null

    const brandName = coachData?.brand_name || 'tu Coach'

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-3" style={{ fontFamily: 'var(--font-outfit)' }}>
                Acceso Pausado
            </h1>
            <p className="text-muted-foreground mb-8 max-w-sm leading-relaxed">
                Tu acceso a la plataforma está temporalmente suspendido. Por favor, contacta a <strong className="text-foreground">{brandName}</strong> para reactivar tu cuenta. Todos tus progresos y datos están a salvo.
            </p>

            <div className="flex flex-col w-full max-w-xs gap-3">
                {coachData?.whatsapp && (
                    <a
                        href={`https://wa.me/${coachData.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center"
                    >
                        Contactar a mi Coach
                    </a>
                )}
                
                <form action="/auth/signout" method="post" className="w-full">
                    <button type="submit" className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-bold hover:bg-secondary/80 transition-all flex items-center justify-center gap-2">
                        <LogOut className="w-4 h-4" /> Cerrar Sesión
                    </button>
                </form>
            </div>
        </div>
    )
}
