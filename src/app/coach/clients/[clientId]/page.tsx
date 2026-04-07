import { Suspense } from 'react'
import { getClientProfileData } from './actions'
import { ArrowLeft, User, Calendar, CreditCard, Activity, Target, Zap, ChevronRight, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientProfileDashboard } from './ClientProfileDashboard'
import { cn } from '@/lib/utils'

export default async function ClientProfilePage({ params }: { params: Promise<{ clientId: string }> }) {
    const { clientId } = await params
    
    return (
        <div className="max-w-[1600px] mx-auto mb-24 md:mb-0 space-y-8 animate-fade-in relative">
            <Link href="/coach/clients"
                className="group inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-primary transition-all">
                <div className="p-1.5 rounded-full bg-secondary dark:bg-white/5 group-hover:bg-primary/10 transition-colors">
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" />
                </div>
                Directorio de Unidades
            </Link>

            <Suspense fallback={<ProfileSkeleton />}>
                <ProfileContent clientId={clientId} />
            </Suspense>
        </div>
    )
}

async function ProfileContent({ clientId }: { clientId: string }) {
    const data = await getClientProfileData(clientId)
    const { client, activeProgram, nutritionPlans } = data

    return (
        <>
            {/* Header del Perfil */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                <div className="absolute -top-10 -left-10 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none z-0" />
                
                <div className="flex items-center gap-4 md:gap-6 relative z-10">
                    <div className="w-16 h-16 md:w-24 md:h-24 rounded-2xl md:rounded-[2rem] bg-white dark:bg-white/5 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-2xl overflow-hidden relative group">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
                        <span className="text-2xl md:text-4xl font-black text-primary uppercase font-display relative z-10">
                            {client.full_name[0]}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl md:text-5xl font-black text-foreground uppercase tracking-tighter font-display leading-none truncate">
                                {client.full_name}
                            </h1>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-black text-[10px] uppercase tracking-widest">
                                Activo
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
                            {client.email}
                        </p>
                    </div>
                </div>
                
                {/* Botones de Acción (Respetando color del coach/sistema) */}
                <div className="flex flex-row items-center gap-3 relative z-10">
                    <GlassButton 
                        asChild 
                        className={cn(
                            "w-12 h-12 p-0 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary transition-all",
                            !client.phone && "opacity-50 grayscale cursor-not-allowed pointer-events-none"
                        )}
                    >
                        {client.phone ? (
                            <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="w-5 h-5" />
                            </a>
                        ) : (
                            <div><MessageCircle className="w-5 h-5" /></div>
                        )}
                    </GlassButton>
                    <GlassButton asChild className="flex-1 md:flex-none h-12 px-6 border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary">
                        <Link href={`/coach/nutrition-builder/${clientId}${nutritionPlans.length > 0 ? `?planId=${nutritionPlans[0].id}` : ''}`}>
                            <span className="font-bold uppercase tracking-widest text-[10px]">Nutrición</span>
                        </Link>
                    </GlassButton>
                    <GlassButton asChild className="flex-1 md:flex-none h-12 px-6 bg-primary text-primary-foreground hover:bg-primary/90 border-none shadow-[0_0_20px_-5px_var(--theme-primary)]">
                        <Link href={`/coach/builder/${clientId}`}>
                            <Zap className="w-4 h-4 mr-2" />
                            <span className="font-bold uppercase tracking-widest text-[10px]">Entrenamiento</span>
                        </Link>
                    </GlassButton>
                </div>
            </div>

            <ClientProfileDashboard data={data} />
        </>
    )
}

function ProfileSkeleton() {
    return (
        <div className="space-y-8">
            <div className="flex items-center gap-6">
                <Skeleton className="w-24 h-24 rounded-2xl" />
                <div className="space-y-3">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-4 w-40" />
                </div>
            </div>
            <Skeleton className="h-8 w-full max-w-md" />
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <Skeleton className="h-64 md:col-span-8 rounded-xl" />
                <Skeleton className="h-64 md:col-span-4 rounded-xl" />
            </div>
        </div>
    )
}
