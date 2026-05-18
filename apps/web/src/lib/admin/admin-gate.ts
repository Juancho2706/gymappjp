/**
 * Admin access control via email allowlist.
 * No DB migration needed — just set ADMIN_EMAILS in env.
 */

export function getAdminEmails(): string[] {
    const raw = process.env.ADMIN_EMAILS || ''
    return raw
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
}

export function isAdminEmail(email: string | undefined | null): boolean {
    if (!email) return false
    return getAdminEmails().includes(email.toLowerCase().trim())
}
