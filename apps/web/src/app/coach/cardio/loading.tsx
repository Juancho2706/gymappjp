import { Skeleton } from '@/components/ui/skeleton'

export default function CardioLoading() {
    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
            <Skeleton className="h-8 w-44 rounded-lg" />
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
    )
}
