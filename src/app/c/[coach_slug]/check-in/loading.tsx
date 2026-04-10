import { Skeleton } from '@/components/ui/skeleton'

export default function CheckInLoading() {
    return (
        <div className="min-h-dvh pb-20">
            <header className="border-b px-4 py-4 pt-safe sticky top-0 z-40 bg-background/95 backdrop-blur-xl">
                <Skeleton className="h-4 w-16 mb-4" />
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
            </header>
            <main className="px-4 py-6 max-w-lg mx-auto space-y-6">
                <div className="flex justify-center gap-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="w-8 h-8 rounded-full" />
                    ))}
                </div>
                <div className="bg-card border rounded-2xl p-6 space-y-5">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-11 w-full rounded-xl" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-8 w-full rounded" />
                    <Skeleton className="h-11 w-full rounded-xl mt-4" />
                </div>
            </main>
        </div>
    )
}
