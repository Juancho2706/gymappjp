import { Badge, type BadgeTone } from '@/components/ui/badge'

const TYPE_TONES: Record<string, BadgeTone> = {
  feature: 'sport',
  fix: 'success',
  announcement: 'ember',
}

const TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  improvement: 'Mejora',
  fix: 'Fix',
  announcement: 'Anuncio',
}

export function NewsTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      tone={TYPE_TONES[type] ?? 'neutral'}
      variant="soft"
      size="sm"
      className="uppercase tracking-wider"
    >
      {TYPE_LABELS[type] || type}
    </Badge>
  )
}
