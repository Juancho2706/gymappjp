"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PreviewBDemoBanner() {
  const pathname = usePathname() ?? "";
  const aboveMobileNav =
    pathname.startsWith("/preview-b/dashboard") ||
    pathname.startsWith("/preview-b/cliente") ||
    pathname.startsWith("/preview-b/builder");

  return (
    <div
      className={cn(
        "pointer-events-none fixed left-3 right-3 z-50 flex justify-center md:left-auto md:right-4 md:justify-end",
        aboveMobileNav ? "preview-b-banner--above-nav" : "preview-b-banner--low",
      )}
    >
      <div className="pointer-events-auto rounded-full border border-border bg-card/95 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm backdrop-blur-sm md:bottom-4 md:text-[11px]">
        Preview · Concept B · no funcional
      </div>
    </div>
  );
}
