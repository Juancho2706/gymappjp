export default function LoadingTeam() {
    return (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
            <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="h-28 animate-pulse rounded-xl bg-muted" />
                <div className="h-28 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
    )
}
