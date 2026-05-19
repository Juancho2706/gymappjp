export interface ShareData {
    title?: string
    text?: string
    url?: string
    files?: File[]
}

export function isWebShareSupported(): boolean {
    if (typeof navigator === 'undefined') return false
    return typeof navigator.share === 'function'
}

export function canShareFiles(files: File[]): boolean {
    if (!isWebShareSupported()) return false
    if (typeof navigator.canShare !== 'function') return false
    try {
        return navigator.canShare({ files })
    } catch {
        return false
    }
}

export async function share(data: ShareData): Promise<boolean> {
    if (!isWebShareSupported()) return false
    try {
        await navigator.share(data as ShareData)
        return true
    } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return false
        return false
    }
}
