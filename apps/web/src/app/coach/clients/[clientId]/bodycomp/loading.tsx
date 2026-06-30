import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
    return (
        <div className="min-h-dvh bg-background px-4 pb-24 pt-4 md:px-6 md:pb-10">
            <div className="mx-auto w-full max-w-3xl space-y-4">
                <Skeleton className="h-10 w-56" />
                <Skeleton className="h-[42px] w-full rounded-control" />
                <Skeleton className="h-11 w-full rounded-control" />
                <Skeleton className="h-64 w-full rounded-card" />
                <Skeleton className="h-40 w-full rounded-card" />
            </div>
        </div>
    )
}
