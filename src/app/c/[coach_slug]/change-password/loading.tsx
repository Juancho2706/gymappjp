import { Skeleton } from '@/components/ui/skeleton'
import { ClientLoadingShell } from '@/components/ui/EvaRouteLoader'

export default function ChangePasswordLoading() {
    return (
        <ClientLoadingShell>
            <div className="min-h-dvh bg-background px-4 py-10">
                <div className="mx-auto max-w-md space-y-6 rounded-2xl border border-border/60 bg-card/30 p-6">
                    <div className="flex justify-center">
                        <Skeleton className="h-12 w-12 rounded-full" />
                    </div>
                    <Skeleton className="mx-auto h-7 w-[85%] max-w-xs" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-12 w-full rounded-xl" />
                </div>
            </div>
        </ClientLoadingShell>
    )
}
