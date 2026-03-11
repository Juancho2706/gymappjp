import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingCoachClients() {
  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-full sm:w-40 rounded-xl" />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 lg:p-6 space-y-4">
           {[...Array(6)].map((_, i) => (
               <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 lg:p-5 rounded-2xl border border-border bg-background/50">
                  <div className="flex items-center gap-4">
                     <Skeleton className="w-12 h-12 lg:w-14 lg:h-14 rounded-full flex-shrink-0" />
                     <div className="space-y-2">
                         <Skeleton className="h-5 w-40" />
                         <Skeleton className="h-4 w-56" />
                     </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-border sm:border-t-0">
                     <Skeleton className="h-9 w-24 rounded-lg" />
                     <Skeleton className="h-9 w-24 rounded-lg" />
                     <Skeleton className="h-9 w-10 rounded-lg ml-auto sm:ml-0" />
                  </div>
               </div>
           ))}
        </div>
      </div>
    </div>
  )
}