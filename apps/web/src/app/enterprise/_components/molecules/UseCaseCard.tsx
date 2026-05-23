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
        'group relative rounded-2xl border border-gray-100 bg-white p-6',
        'transition-all duration-300 hover:-translate-y-1.5 hover:border-[#007AFF]/30',
        'shadow-[0_8px_32px_0_rgba(0,0,0,0.06)] hover:shadow-[0_12px_48px_0_rgba(0,122,255,0.10)]',
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 mb-4 group-hover:border-[#007AFF]/30 group-hover:bg-[#007AFF]/10 transition-colors duration-300">
        <Icon className="h-5 w-5 text-gray-500 group-hover:text-[#007AFF] transition-colors duration-300" aria-hidden strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-xs leading-relaxed text-gray-500 mb-4">{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[10px] font-medium text-gray-500"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
