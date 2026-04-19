"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpen, Home, LayoutGrid, Moon, Sun, Users } from "lucide-react";
import { BRAND_APP_ICON } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";
import { usePreviewBTheme } from "./PreviewBRoot";

const nav = [
  { href: "/preview-b", label: "Índice", short: "Inicio", icon: Home, match: (p: string) => p === "/preview-b" },
  {
    href: "/preview-b/dashboard",
    label: "Dashboard",
    short: "Panel",
    icon: LayoutGrid,
    match: (p: string) => p.startsWith("/preview-b/dashboard"),
  },
  {
    href: "/preview-b/cliente",
    label: "Alumnos",
    short: "Roster",
    icon: Users,
    match: (p: string) => p.startsWith("/preview-b/cliente"),
  },
  {
    href: "/preview-b/builder",
    label: "Builder",
    short: "Plan",
    icon: BookOpen,
    match: (p: string) => p.startsWith("/preview-b/builder"),
  },
];

export function PaperShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const { isDark, toggleTheme } = usePreviewBTheme();

  return (
    <div className="relative min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card pt-[max(0.75rem,env(safe-area-inset-top))] md:flex">
        <Link href="/preview-b" className="flex items-center gap-3 px-5 pb-6 pt-2">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden smoked-badge">
            <Image
              src={BRAND_APP_ICON}
              alt=""
              width={26}
              height={26}
              className="relative z-[1] object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="caption-micro text-primary">EVA</p>
            <p className="truncate text-sm font-semibold tracking-tight text-foreground">
              Luminous Paper
            </p>
          </div>
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Principal">
          {nav.slice(1).map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate tracking-tight",
                    active ? "display-editorial text-base font-semibold" : "font-medium",
                  )}
                >
                  {active ? (
                    <span className="editorial-underline">{item.label}</span>
                  ) : (
                    item.label
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 border-t border-border px-4 py-5">
          <p className="caption-micro">Terminal</p>
          <p className="text-sm font-medium text-foreground">Marina Costa</p>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Modo claro" : "Modo papel"}
          </button>
          <Link
            href="/preview-b/login"
            className="caption-micro block py-2 text-primary hover:underline"
          >
            Iniciar sesión →
          </Link>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0 md:pl-60">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 min-h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
          <Link href="/preview-b" className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden smoked-badge">
              <Image
                src={BRAND_APP_ICON}
                alt=""
                width={24}
                height={24}
                className="relative z-[1] object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="caption-micro leading-none text-foreground">EVA</p>
              <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                Luminous Paper
              </p>
            </div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/preview-b/login"
              className="caption-micro rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Entrar
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:border-primary/40"
              aria-label={isDark ? "Modo claro" : "Modo oscuro"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <header className="hidden border-b border-border bg-background/80 px-8 py-6 backdrop-blur-sm md:block">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="display-editorial text-2xl tracking-tight text-foreground md:text-3xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
              ) : null}
            </div>
          </header>

          <div className="border-b border-border px-4 py-5 md:hidden">
            <h1 className="display-editorial text-xl tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            ) : null}
            {actions ? (
              <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
            ) : null}
          </div>

          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>

        {/* Mobile bottom navigation */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 flex min-h-[4.5rem] items-stretch border-t border-border bg-card/95 px-1 pt-1 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
          aria-label="Secciones"
        >
          {nav.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", active && "text-primary")} aria-hidden />
                <span className="max-w-full truncate">{item.short}</span>
                <span
                  className={cn(
                    "h-0.5 w-7 shrink-0 rounded-full transition-colors",
                    active ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
