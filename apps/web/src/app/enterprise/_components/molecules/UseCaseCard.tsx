import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface UseCaseCardProps {
  icon: LucideIcon
  title: string
  desc: string
  tags: readonly string[]
  className?: string
}

export function UseCaseCard({ icon: Icon, title, desc, tags, className }: UseCaseCardProps) {
  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-sm',
        'transition-all duration-300 hover:border-amber-500/30',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 mb-4 group-hover:border-amber-500/30 group-hover:bg-amber-500/10 transition-colors duration-300">
        <Icon className="h-5 w-5 text-zinc-400 group-hover:text-amber-400 transition-colors duration-300" aria-hidden strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-bold text-zinc-100 mb-2">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-400 mb-4">{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-zinc-700 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
