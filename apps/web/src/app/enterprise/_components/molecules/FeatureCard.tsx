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
        'group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-sm',
        'transition-all duration-300 hover:border-amber-500/30 hover:bg-zinc-900/80',
        'shadow-[0_1px_3px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.03)]',
        size === 'large' && 'md:col-span-2',
        className,
      )}
    >
      {/* Subtle inner glow on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
           style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(251,191,36,0.06), transparent)' }} />

      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 mb-4">
          <Icon className="h-5 w-5 text-amber-400" aria-hidden strokeWidth={1.5} />
        </div>
        <h3 className={cn('font-bold text-zinc-100 mb-2', size === 'large' ? 'text-base' : 'text-sm')}>
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-zinc-400">{desc}</p>
      </div>
    </div>
  )
}
