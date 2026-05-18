/** Two-letter initials for library avatars (no image URL in list query). */
export function libraryInitialsFromName(name: string | undefined | null): string {
    if (!name?.trim()) return '?'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) {
        const w = parts[0]
        return w.length >= 2 ? w.slice(0, 2).toUpperCase() : w.slice(0, 1).toUpperCase()
    }
    const a = parts[0][0] ?? ''
    const b = parts[parts.length - 1][0] ?? ''
    return `${a}${b}`.toUpperCase()
}
