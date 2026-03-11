"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Dumbbell, TrendingUp } from "lucide-react"

interface PlanLinkProps {
  href: string
  title: string
  subtitle?: string
  isToday?: boolean
  className?: string
  coach_slug: string
  planId: string
}

export function PlanLink({
  href,
  title,
  subtitle,
  isToday = false,
  className,
  coach_slug,
  planId,
}: PlanLinkProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const router = useRouter()

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    setIsAnimating(true)
    setTimeout(() => {
      router.push(href)
    }, 700) // Match animation duration
  }

  return (
    <>
      {isAnimating && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in-0 duration-500">
          <div className="text-center animate-in fade-in-0 slide-in-from-bottom-5 duration-700">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        </div>
      )}

      {isToday ? (
        <Link
          href={href}
          onClick={handleClick}
          className="block bg-card border border-border rounded-2xl p-5 hover:border-border hover:border-accent transition-all duration-200 group"
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
                borderColor:
                  "color-mix(in srgb, var(--theme-primary) 30%, transparent)",
              }}
            >
              <Dumbbell
                className="w-5 h-5"
                style={{ color: "var(--theme-primary)" }}
              />
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
          </div>
          <p className="text-xs text-muted-foreground font-medium mb-1">
            Entrenamiento de hoy
          </p>
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <div
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--theme-primary) 15%, transparent)",
              color: "var(--theme-primary)",
            }}
          >
            Empezar ahora →
          </div>
        </Link>
      ) : (
        <Link
          href={href}
          onClick={handleClick}
          className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 hover:border-border hover:border-accent transition-all group"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--theme-primary) 10%, transparent)",
            }}
          >
            <TrendingUp
              className="w-4 h-4"
              style={{ color: "var(--theme-primary)" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
        </Link>
      )}
    </>
  )
}
