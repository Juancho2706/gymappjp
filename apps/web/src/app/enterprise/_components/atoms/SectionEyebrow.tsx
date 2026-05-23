import { cn } from '@/lib/utils'

interface SectionEyebrowProps {
  children: React.ReactNode
  className?: string
}

export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return (
    <p
      className={cn(
        'text-xs font-bold uppercase tracking-[0.22em] text-[#007AFF]',
        className,
      )}
    >
      {children}
    </p>
  )
}
