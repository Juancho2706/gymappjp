import { cn } from '@/lib/utils'
import type { AnchorHTMLAttributes } from 'react'

interface GradientButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'primary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export function GradientButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: GradientButtonProps) {
  return (
    <a
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        size === 'sm' && 'h-9 px-5 text-xs',
        size === 'md' && 'h-11 px-7 text-sm',
        size === 'lg' && 'h-13 px-9 text-base',
        variant === 'primary' && [
          'bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950',
          'shadow-[0_4px_24px_rgba(245,158,11,0.35)]',
          'hover:from-amber-400 hover:to-amber-500 hover:shadow-[0_6px_32px_rgba(245,158,11,0.5)]',
          'active:from-amber-600 active:to-amber-700',
        ],
        variant === 'ghost' && [
          'border border-zinc-700 text-zinc-300',
          'hover:border-amber-500/50 hover:text-amber-400 hover:bg-amber-500/5',
          'active:bg-amber-500/10',
        ],
        variant === 'outline' && [
          'border border-zinc-600 text-zinc-200',
          'hover:border-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
          'active:bg-zinc-800',
        ],
        className,
      )}
    >
      {children}
    </a>
  )
}
