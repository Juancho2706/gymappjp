import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComparisonRowProps {
  label: string
  individual: boolean | string
  enterprise: boolean | string
  className?: string
}

export function ComparisonRow({ label, individual, enterprise, className }: ComparisonRowProps) {
  const renderCell = (value: boolean | string) => {
    if (typeof value === 'boolean') {
      return value
        ? <CheckCircle2 className="h-5 w-5 text-amber-400 mx-auto" aria-label="Incluido" />
        : <XCircle className="h-5 w-5 text-zinc-600 mx-auto" aria-label="No incluido" />
    }
    return <span className="text-sm text-zinc-300 font-medium">{value}</span>
  }

  return (
    <div className={cn('grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 border-b border-zinc-800/60 last:border-0', className)}>
      <span className="text-sm text-zinc-400">{label}</span>
      <div className="w-24 text-center">{renderCell(individual)}</div>
      <div className="w-24 text-center">{renderCell(enterprise)}</div>
    </div>
  )
}
