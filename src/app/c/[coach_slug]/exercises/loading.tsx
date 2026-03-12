import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell } from "lucide-react";

export default function ExercisesLoading() {
  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border/10 px-4 py-4 md:px-8 sticky top-0 bg-background/80 backdrop-blur-xl z-40 flex items-center gap-3 shadow-sm">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: "rgba(128, 128, 128, 0.1)",
          }}
        >
          <Dumbbell className="w-5 h-5 text-muted-foreground/40" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </header>

      <main className="px-4 py-6 md:px-8 max-w-5xl mx-auto relative z-0">
        <div className="space-y-8">
          {/* Search bar skeleton */}
          <Skeleton className="h-12 w-full rounded-2xl" />

          {/* Muscle groups skeletons */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
