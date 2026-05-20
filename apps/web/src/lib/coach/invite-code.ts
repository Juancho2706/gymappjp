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
