'use client'

import { useState, useMemo } from 'react'
import { Search, TrendingUp, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GlassButton } from '@/components/ui/glass-button'
import { GlassCard } from '@/components/ui/glass-card'
import { ClientCard } from '@/components/coach/ClientCard'

interface ClientsDirectoryClientProps {
    clients: any[]
    coach: any
    appUrl: string
}

export function ClientsDirectoryClient({ clients, coach, appUrl }: ClientsDirectoryClientProps) {
    const [search, setSearch] = useState('')

    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            const matchesSearch = 
                client.full_name.toLowerCase().includes(search.toLowerCase()) ||
                client.email.toLowerCase().includes(search.toLowerCase())
            
            return matchesSearch
        })
    }, [clients, search])

    return (
        <div className="space-y-6 md:space-y-12">
            {/* List Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative z-20">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                        placeholder="Buscar unidad por nombre o email..." 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-11 h-12 bg-white/50 dark:bg-white/[0.03] border-border/50 dark:border-white/10 rounded-2xl backdrop-blur-md focus:ring-primary/20 transition-all font-medium"
                    />
                </div>
                
                {/* Oculto en móvil, visible en md */}
                <div className="hidden md:flex items-center gap-3 w-full md:w-auto">
                    <GlassButton className="flex-1 md:flex-none h-12 px-6 border border-primary/10">
                        <TrendingUp className="w-4 h-4 mr-2" />
                        <span className="font-bold uppercase tracking-widest text-[10px]">Ordenar</span>
                    </GlassButton>
                </div>
            </div>

            {/* Main Directory */}
            {filteredClients.length === 0 ? (
                <GlassCard className="flex flex-col items-center justify-center py-20 md:py-32 text-center mx-4 md:mx-0">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl">
                        <Users className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground opacity-20" />
                    </div>
                    <h3 className="text-lg md:text-xl font-black text-foreground uppercase tracking-tighter mb-2 font-display">
                        Sin resultados
                    </h3>
                    <p className="text-muted-foreground text-xs md:text-sm max-w-xs font-medium leading-relaxed px-4">
                        No se han encontrado alumnos que coincidan con la búsqueda.
                    </p>
                </GlassCard>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8 relative z-10 px-4 md:px-0 pb-20 md:pb-0">
                    {filteredClients.map((client) => {
                        let subscriptionDaysRemaining = null
                        if (client.subscription_start_date) {
                            const start = new Date(client.subscription_start_date)
                            const end = new Date(start)
                            end.setMonth(end.getMonth() + 1)
                            const diff = Math.ceil((end.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                            subscriptionDaysRemaining = diff
                        }

                        const loginUrl = coach && appUrl ? `${appUrl}/c/${coach.slug}/login` : ''
                        const whatsappLink = client.phone 
                            ? `https://wa.me/${client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${client.full_name}, aquí tienes tu link de acceso a la app: ${loginUrl}`)}`
                            : '#'
                        
                        const activeProgram = client.workout_programs?.find((p: any) => p.is_active);
                        
                        return (
                            <ClientCard 
                                key={client.id}
                                client={client}
                                loginUrl={loginUrl}
                                whatsappLink={whatsappLink}
                                subscriptionDaysRemaining={subscriptionDaysRemaining}
                                remainingDays={15} // Mock
                                activeProgramName={activeProgram?.name || null}
                            />
                        )
                    })}
                </div>
            )}
        </div>
    )
}

