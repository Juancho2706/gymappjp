import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-all outline-none placeholder:text-zinc-600 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
