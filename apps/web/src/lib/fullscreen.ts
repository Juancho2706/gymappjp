type FullscreenDocument = Document & {
    webkitExitFullscreen?: () => Promise<void>
    webkitFullscreenElement?: Element | null
}

type FullscreenElement = Element & {
    webkitRequestFullscreen?: () => Promise<void>
}

type OrientationLockType = 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary'

type ScreenOrientationWithLock = ScreenOrientation & {
    lock?: (orientation: OrientationLockType) => Promise<void>
}

export function isFullscreenSupported(): boolean {
    if (typeof document === 'undefined') return false
    const doc = document as FullscreenDocument
    return typeof document.documentElement.requestFullscreen === 'function' ||
        typeof (document.documentElement as FullscreenElement).webkitRequestFullscreen === 'function' ||
        typeof doc.webkitExitFullscreen === 'function'
}

export function isFullscreen(): boolean {
    if (typeof document === 'undefined') return false
    const doc = document as FullscreenDocument
    return Boolean(document.fullscreenElement ?? doc.webkitFullscreenElement)
}

export async function enterFullscreen(element?: Element): Promise<boolean> {
    if (typeof document === 'undefined') return false
    const el = (element ?? document.documentElement) as FullscreenElement
    try {
        if (el.requestFullscreen) {
            await el.requestFullscreen()
            return true
        }
        if (el.webkitRequestFullscreen) {
            await el.webkitRequestFullscreen()
            return true
        }
    } catch {
        // Silent fail (e.g. user gesture required, permission denied)
    }
    return false
}

export async function exitFullscreen(): Promise<boolean> {
    if (typeof document === 'undefined') return false
    const doc = document as FullscreenDocument
    try {
        if (document.exitFullscreen && document.fullscreenElement) {
            await document.exitFullscreen()
            return true
        }
        if (doc.webkitExitFullscreen && doc.webkitFullscreenElement) {
            await doc.webkitExitFullscreen()
            return true
        }
    } catch {
        // Silent fail
    }
    return false
}

export async function lockOrientation(orientation: OrientationLockType = 'portrait'): Promise<boolean> {
    if (typeof screen === 'undefined' || !screen.orientation) return false
    const orient = screen.orientation as ScreenOrientationWithLock
    try {
        if (orient.lock) {
            await orient.lock(orientation)
            return true
        }
    } catch {
        // iOS Safari + most browsers reject without fullscreen first
    }
    return false
}

export function unlockOrientation(): void {
    if (typeof screen === 'undefined' || !screen.orientation) return
    try {
        screen.orientation.unlock()
    } catch {
        // Silent fail
    }
}
