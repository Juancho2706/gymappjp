export type CoachPublicIdentifierSource = {
    invite_code?: string | null
    slug?: string | null
}

export function getCoachPublicIdentifier(coach: CoachPublicIdentifierSource | null | undefined): string {
    return coach?.invite_code?.trim() || coach?.slug?.trim() || ''
}

export function buildCoachStudentPath(coach: CoachPublicIdentifierSource | null | undefined, suffix = ''): string {
    const identifier = getCoachPublicIdentifier(coach)
    return identifier ? `/c/${encodeURIComponent(identifier)}${suffix}` : ''
}

export function buildCoachStudentUrl(
    appUrl: string,
    coach: CoachPublicIdentifierSource | null | undefined,
    suffix = ''
): string {
    const path = buildCoachStudentPath(coach, suffix)
    return path ? `${appUrl}${path}` : ''
}
