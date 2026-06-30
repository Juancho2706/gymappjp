import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { CheckInForm } from './CheckInForm'
import { getCheckInPageData } from './_data/check-in.queries'
import { getClientBasePath } from '@/lib/client/base-path'

export const metadata: Metadata = { title: 'Check-in Mensual | EVA' }

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function ClientCheckInPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const { user, coachPrimaryColor, lastCheckIn } = await getCheckInPageData(coach_slug)
    if (!user) redirect(`${base}/login`)
    if (!coachPrimaryColor) redirect(`${base}/dashboard`)

    return (
        <div className="min-h-dvh bg-surface-app pb-24 pt-safe">
            <div className="mx-auto max-w-lg">
                <CheckInForm
                    coachSlug={coach_slug}
                    coachPrimaryColor={coachPrimaryColor}
                    lastCheckIn={lastCheckIn}
                />
            </div>
        </div>
    )
}
