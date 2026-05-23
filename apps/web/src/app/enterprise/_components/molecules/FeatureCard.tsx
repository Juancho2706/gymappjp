import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface FeatureCardProps {
  icon: LucideIcon
  title: string
  desc: string
  size?: 'normal' | 'large'
  className?: string
}

export function FeatureCard({ icon: Icon, title, desc, size = 'normal', className }: FeatureCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-gray-100 bg-white p-6',
        'transition-all duration-300 hover:-translate-y-1.5',
        'shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] hover:shadow-[0_12px_48px_0_rgba(0,122,255,0.10)]',
        size === 'large' && 'md:col-span-2',
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#007AFF]/20 bg-[#007AFF]/10 mb-4">
        <Icon className="h-5 w-5 text-[#007AFF]" aria-hidden strokeWidth={1.5} />
      </div>
      <h3 className={cn('font-bold text-gray-900 mb-2', size === 'large' ? 'text-base' : 'text-sm')}>
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-gray-500">{desc}</p>
      <p className="mt-3 text-[10px] font-mono uppercase tracking-[0.15em] text-gray-300">{'// FULL COMPLIANCE'}</p>
    </div>
  )
}
