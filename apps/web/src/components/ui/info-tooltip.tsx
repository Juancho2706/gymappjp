'use client'

import * as React from 'react'
import { Info } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface InfoTooltipProps {
  title?: string
  content: string
  className?: string
  iconClassName?: string
}

export function InfoTooltip({ title, content, className, iconClassName }: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false)

  return (
    // <span> (not <div>): InfoTooltip is frequently placed inside <p>/inline text; a <div> there
    // is invalid HTML and triggers a hydration error. inline-flex keeps the same visual layout,
    // and the Radix trigger (<button>) + portaled content stay valid phrasing content.
    <span
      className={cn("inline-flex items-center justify-center", className)}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            "text-muted-foreground hover:text-primary focus:outline-none transition-colors cursor-pointer",
            iconClassName
          )}
          onClick={() => setOpen(!open)}
          aria-label="Información adicional"
        >
          <Info className="w-4 h-4" />
        </PopoverTrigger>
        <PopoverContent 
          className="w-64 p-3 bg-card/95 backdrop-blur-xl border-border/50 shadow-xl z-[100]" 
          side="top"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {title && <h4 className="font-bold text-sm mb-1">{title}</h4>}
          <p className="text-xs text-muted-foreground leading-relaxed">{content}</p>
        </PopoverContent>
      </Popover>
    </span>
  )
}
