import { timingSafeEqual } from 'crypto'
import { redirect } from 'next/navigation'
import { BetaRegisterForm } from './BetaRegisterForm'

function verifyBetaToken(candidate: string): boolean {
    const expected = process.env.BETA_INVITE_TOKEN ?? ''
    if (!expected || !candidate) return false
    const maxLen = Math.max(candidate.length, expected.length)
    const a = Buffer.alloc(maxLen)
    const b = Buffer.alloc(maxLen)
    a.write(candidate)
    b.write(expected)
    return timingSafeEqual(a, b) && candidate.length === expected.length
}

export default async function BetaRegisterPage({
    searchParams,
}: {
    searchParams: Promise<{ t?: string }>
}) {
    const { t } = await searchParams
    if (!t || !verifyBetaToken(t)) {
        redirect('/register')
    }

    return <BetaRegisterForm token={t} />
}
