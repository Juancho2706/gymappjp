import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'

export default function LoadingClientNutrition() {
    return (
        <div className="min-h-screen bg-background animate-in fade-in duration-500">
            <header className="border-b border-border px-4 py-4 flex items-center gap-3">
                <div className="p-2 -ml-2 text-muted-foreground">
                    <ArrowLeft className="w-5 h-5" />
                </div>
                <Skeleton className="h-7 w-48" />
            </header>

            <main className="px-4 py-6 space-y-8 max-w-2xl mx-auto">
                <section className="space-y-4">
                    <Skeleton className="h-9 w-64" />
                    <div className="bg-card/50 border border-border rounded-xl p-4 space-y-3">
                        <Skeleton className="h-3 w-32" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    </div>
                </section>

                <hr className="border-border" />

                <section className="space-y-6">
                    <Skeleton className="h-7 w-40" />
                    
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-card border border-border rounded-2xl p-5 space-y-4">
                            <div className="flex justify-between items-center">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-5 w-32" />
                                    <Skeleton className="h-4 w-24" />
                                </div>
                                <Skeleton className="h-8 w-8 rounded-full" />
                            </div>
                            <div className="space-y-2">
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </section>
            </main>
        </div>
    )
}
