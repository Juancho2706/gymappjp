import { Skeleton } from '@/components/ui/skeleton'

export function DashboardHeaderSkeleton() {
    return (
        <header className="flex h-14 items-center justify-between px-4">
            <Skeleton className="h-5 w-36" />
            <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
        </header>
    )
}

export function CalendarSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                        <Skeleton className="h-2 w-5" />
                        <Skeleton className="h-8 w-8 rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    )
}

export function CheckInSkeleton() {
    return <Skeleton className="h-14 w-full rounded-xl" />
}

export function HeroOnlySkeleton() {
    return <Skeleton className="h-48 w-full rounded-2xl" />
}

export function ComplianceRingsSkeleton() {
    return (
        <div className="space-y-3 rounded-2xl border border-border/40 bg-card/30 p-4 shadow-sm backdrop-blur-md">
            <Skeleton className="mx-auto h-3 w-28" />
            <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                        <Skeleton className="h-20 w-20 rounded-full sm:h-24 sm:w-24" />
                        <Skeleton className="h-2 w-12" />
                    </div>
                ))}
            </div>
        </div>
    )
}

/** Hero + anillos (p. ej. loading legacy / docs). */
export function HeroAndComplianceSkeleton() {
    return (
        <div className="space-y-4">
            <HeroOnlySkeleton />
            <ComplianceRingsSkeleton />
        </div>
    )
}

export function PersonalRecordsSkeleton() {
    return <Skeleton className="h-24 w-full rounded-2xl" />
}

export function WeightChartSkeleton() {
    return <Skeleton className="h-64 w-full rounded-2xl" />
}

export function DashboardSidebarSkeleton() {
    return (
        <>
            <ComplianceRingsSkeleton />
            <WeightSkeleton />
            <NutritionSkeleton />
            <PersonalRecordsSkeleton />
        </>
    )
}

export function NutritionSkeleton() {
    return (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-24" />
            {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-2 w-full rounded-full" />
            ))}
            {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
            ))}
        </div>
    )
}

export function WeightSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="mt-3 h-[72px] w-full rounded-xl" />
        </div>
    )
}

export function ProgramSkeleton() {
    return (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-2 w-full rounded-full" />
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
        </div>
    )
}

export function HistorySkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex h-14 items-center gap-3 border-b border-border/30 px-4 last:border-0">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-2 w-20" />
                    </div>
                </div>
            ))}
        </div>
    )
}
