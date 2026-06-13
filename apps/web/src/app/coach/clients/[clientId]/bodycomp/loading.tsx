import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="min-h-dvh bg-background px-4 pb-24 pt-4 md:px-6 md:pb-10">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-10 w-full max-w-xs" />
                <Skeleton className="h-64 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
        </div>
    )
}
