import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingCoachDashboard() {
  return (
    <div className="p-4 lg:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="p-6 bg-card border rounded-2xl space-y-4">
             <div className="flex justify-between items-center">
                 <Skeleton className="h-5 w-24" />
                 <Skeleton className="h-10 w-10 rounded-xl" />
             </div>
             <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-2xl p-6">
         <Skeleton className="h-6 w-32 mb-6" />
         <div className="space-y-4">
             {[...Array(5)].map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                   <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                         <Skeleton className="h-4 w-32" />
                         <Skeleton className="h-3 w-48" />
                      </div>
                   </div>
                   <Skeleton className="h-8 w-24 rounded-full" />
                </div>
             ))}
         </div>
      </div>
    </div>
  )
}