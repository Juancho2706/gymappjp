'use client'

import { createContext, useContext } from 'react'

/**
 * F2 — base path for the client app. The student screen tree lives at `/c/[coach_slug]/*` but is
 * ALSO served under `/e/[org_slug]/*` (enterprise area, via a proxy rewrite). Components must build
 * in-app links from this base instead of hardcoding `/c/${coachSlug}` so the visible URL stays
 * consistent under either prefix. The layout resolves it from the `x-client-base-path` header
 * (set by the proxy when rewriting `/e/*` → `/c/*`) and falls back to `/c/${coach_slug}` — so the
 * standalone `/c/*` experience is byte-identical (no header → same strings as before).
 */
const BasePathContext = createContext<string | null>(null)

export function BasePathProvider({ value, children }: { value: string; children: React.ReactNode }) {
    return <BasePathContext.Provider value={value}>{children}</BasePathContext.Provider>
}

/**
 * Returns the client-app base path (e.g. `/c/jose` or `/e/gym-prueba`). Falls back to the provided
 * default when used outside a provider (defensive — keeps existing usages working).
 */
export function useBasePath(fallback?: string): string {
    const value = useContext(BasePathContext)
    return value ?? fallback ?? ''
}
