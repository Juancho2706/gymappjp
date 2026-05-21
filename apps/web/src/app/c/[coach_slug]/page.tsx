import { redirect } from 'next/navigation'
import { getClientRootUser } from './_data/client-root.queries'

interface Props {
    params: Promise<{ coach_slug: string }>
}

export default async function CoachRootPage({ params }: Props) {
    const { coach_slug } = await params
    const user = await getClientRootUser()

    if (user) {
        redirect(`/c/${coach_slug}/dashboard`)
    }

    redirect(`/c/${coach_slug}/login`)
}
