"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EvaWatermark } from "./EvaWatermark";
import { MarqueeBar } from "./MarqueeBar";

const rail = [
  { href: "/preview-c", label: "Inicio", short: "IDX" },
  { href: "/preview-c/dashboard", label: "Panel", short: "D" },
  { href: "/preview-c/cliente", label: "Roster", short: "R" },
  { href: "/preview-c/builder", label: "Build", short: "B" },
];

function match(path: string, href: string) {
  if (href === "/preview-c") return path === "/preview-c" || path === "/preview-c/";
  return path.startsWith(href);
}

export function BrutalistShell({
  title,
  subtitle,
  marquee,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  marquee?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";

  return (
    <div className="relative z-[1] flex min-h-dvh flex-col pb-[calc(var(--pc-bottom-nav)+env(safe-area-inset-bottom,0px))] md:pb-0 md:pl-[var(--pc-rail-w)]">
      <EvaWatermark />
      {/* Desktop rail */}
      <aside
        className="fixed bottom-0 left-0 top-0 z-40 hidden w-[var(--pc-rail-w)] flex-col border-r-2 border-[var(--pc-chalk)] bg-[var(--pc-void)] md:flex"
        aria-label="Navegación"
      >
        {rail.map((item) => {
          const active = match(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active ? "true" : "false"}
              className={cn(
                "pc-hover-ring flex min-h-[4.5rem] flex-1 items-center justify-center border-b-2 border-[rgba(255,255,255,0.12)] text-[0.625rem] font-extrabold uppercase tracking-[0.28em] transition-colors [writing-mode:vertical-rl] [text-orientation:mixed]",
                active
                  ? "bg-[var(--pc-chalk)] text-[var(--pc-void)]"
                  : "text-[var(--pc-muted)] hover:bg-[#0a0a0a] hover:text-[var(--pc-chalk)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b-2 border-[var(--pc-chalk)] bg-[var(--pc-void)] px-3 pt-[max(0.35rem,env(safe-area-inset-top))] md:hidden">
        <Link
          href="/preview-c"
          className="pc-caps-micro rounded-sm border border-[rgba(255,255,255,0.25)] px-2 py-1 text-[var(--pc-chalk)]"
        >
          EVA
        </Link>
        <span className="truncate text-center text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--pc-chalk)]">
          {title}
        </span>
        <Link href="/preview-c/login" className="pc-btn-solid !min-h-10 px-3 py-2 text-[0.6rem]">
          Log
        </Link>
      </header>

      {marquee ? <MarqueeBar text={marquee} /> : null}

      <div className="hidden border-b-2 border-[var(--pc-chalk)] px-6 py-6 md:block">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold uppercase tracking-[0.08em] text-[var(--pc-chalk)] md:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-[var(--pc-muted)] md:text-base">
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>

      <div className="border-b-2 border-[var(--pc-chalk)] px-3 py-4 md:hidden">
        {subtitle ? (
          <p className="text-xs font-medium leading-relaxed text-[var(--pc-muted)]">{subtitle}</p>
        ) : null}
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </div>

      <main className="relative z-[1] flex-1 px-3 py-5 md:px-8 md:py-8">{children}</main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex h-[var(--pc-bottom-nav)] min-h-[var(--pc-bottom-nav)] items-stretch border-t-2 border-[var(--pc-chalk)] bg-[var(--pc-void)] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        aria-label="Secciones"
      >
        {rail.map((item) => {
          const active = match(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 border-r-2 border-[rgba(255,255,255,0.12)] py-2 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] last:border-r-0",
                active
                  ? "bg-[var(--pc-primary)] text-[var(--pc-void)]"
                  : "text-[var(--pc-muted)] hover:bg-[#080808] hover:text-[var(--pc-chalk)]",
              )}
            >
              <span className="pc-mono text-sm">{item.short}</span>
              <span className="max-w-full truncate text-[0.55rem] opacity-80">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
