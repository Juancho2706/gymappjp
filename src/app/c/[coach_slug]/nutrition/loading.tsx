export default function NutritionLoading() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 px-4 py-3.5 border-b border-border/10 bg-background/80 backdrop-blur-xl z-40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-muted rounded-xl animate-pulse" />
          <div className="space-y-1">
            <div className="h-5 w-32 bg-muted rounded animate-pulse" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="w-11 h-11 bg-muted rounded-xl animate-pulse" />
          <div className="h-6 w-28 bg-muted rounded animate-pulse" />
          <div className="w-11 h-11 bg-muted rounded-xl animate-pulse" />
        </div>

        <div className="bg-card border border-border rounded-3xl p-5 space-y-4 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-muted rounded" />
            <div className="h-10 w-40 bg-muted rounded" />
            <div className="h-3 w-full bg-muted rounded-full" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 bg-muted rounded-full" />
                <div className="h-3 w-12 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>

        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-muted rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-3 w-48 bg-muted rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
