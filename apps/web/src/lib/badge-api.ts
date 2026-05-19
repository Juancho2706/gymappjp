type NavigatorWithBadge = Navigator & {
    setAppBadge?: (count?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
}

export function isBadgeSupported(): boolean {
    if (typeof navigator === 'undefined') return false
    const nav = navigator as NavigatorWithBadge
    return typeof nav.setAppBadge === 'function'
}

export async function setBadge(count: number): Promise<void> {
    if (!isBadgeSupported()) return
    const nav = navigator as NavigatorWithBadge
    try {
        await nav.setAppBadge?.(count > 0 ? count : undefined)
    } catch {
        // Silent fail on permission/policy errors
    }
}

export async function clearBadge(): Promise<void> {
    if (!isBadgeSupported()) return
    const nav = navigator as NavigatorWithBadge
    try {
        await nav.clearAppBadge?.()
    } catch {
        // Silent fail
    }
}
