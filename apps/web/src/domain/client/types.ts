export type ClientStatus = 'active' | 'inactive'

export type ClientProfile = {
    id: string
    fullName: string
    coachId: string
    email?: string | null
}
