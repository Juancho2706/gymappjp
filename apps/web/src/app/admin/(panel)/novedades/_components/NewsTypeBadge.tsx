import { cn } from '@/lib/utils'

const TYPE_STYLES: Record<string, string> = {
  feature: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  improvement: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  fix: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  announcement: 'bg-purple-500/15 text-purple-500 border-purple-500/20',
}

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  improvement: 'Mejora',
  fix: 'Fix',
  announcement: 'Anuncio',
}

export function NewsTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
        TYPE_STYLES[type] || 'bg-muted text-muted-foreground border-border'
      )}
    >
      {TYPE_LABELS[type] || type}
    </span>
  )
}
