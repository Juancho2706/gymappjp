const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'

export function generateTempPassword(length = 12): string {
    const arr = new Uint8Array(length)
    crypto.getRandomValues(arr)
    return Array.from(arr, b => CHARS[b % CHARS.length]).join('')
}
