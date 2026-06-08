import { redirect } from 'next/navigation'
import { getClientRootUser } from './_data/client-root.queries'
import { getClientBasePath } from '@/lib/client/base-path'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function CoachRootPage({ params }: Props) {
    const { coach_slug } = await params
    const base = await getClientBasePath(coach_slug)
    const user = await getClientRootUser()

    if (user) {
        redirect(`${base}/dashboard`)
    }

    redirect(`${base}/login`)
}
