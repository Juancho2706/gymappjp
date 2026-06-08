import { headers } from 'next/headers'

/**
 * F2 (server side) — resolve the client-app base path inside Server Components. Mirror of the
 * client `useBasePath`: returns the `x-client-base-path` header set by the proxy when serving the
 * student tree under `/e/[org_slug]` (rewrite → `/c/[coach_slug]`), falling back to the standalone
 * `/c/${coachSlug}` so direct `/c/*` rendering is byte-identical.
 */
export async function getClientBasePath(coachSlug: string): Promise<string> {
    const h = await headers()
    return h.get('x-client-base-path') || `/c/${coachSlug}`
}
