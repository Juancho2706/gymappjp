const INVITE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const INVITE_CODE_PATTERN = /^[A-Z2-9]{5}$/

export function generateInviteCode(): string {
    let code = ''
    for (let i = 0; i < 5; i++) {
        code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)]
    }
    return code
}

export function isValidInviteCode(value: string | null | undefined): value is string {
    return INVITE_CODE_PATTERN.test(value?.trim() ?? '')
}

/**
 * Canonical mapping of a public coach identifier to the column to match on.
 * Generated codes (e.g. "AB3KP") resolve via `invite_code` (primary), everything
 * else via the legacy `slug`. Use this everywhere a `/c/[identifier]` URL is
 * resolved so code-only coaches (no legacy slug) never 404.
 */
export function coachIdentifierColumn(identifier: string | null | undefined): 'invite_code' | 'slug' {
    return isValidInviteCode(identifier) ? 'invite_code' : 'slug'
}
