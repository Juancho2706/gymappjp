import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getClientBasePath } from '@/lib/client/base-path'
import { getClientNutritionUser } from '../_data/nutrition-auth.queries'
import { getFavoriteIntakeFoods, getRecentIntakeFoods } from '../_data/intake.queries'
import { getClientScope } from '../_data/client-scope.queries'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import { AddFoodClient } from './AddFoodClient'

export const metadata: Metadata = { title: 'Registrar alimento' }

interface Props {
  params: Promise<{ coach_slug: string }>
}

export default async function AddNutritionFoodPage({ params }: Props) {
  const { coach_slug } = await params
  const base = await getClientBasePath(coach_slug)
  const { user, hasClientRow } = await getClientNutritionUser()

  if (!user || !hasClientRow) redirect(`${base}/login`)

  // Gate de dominio: si el coach apago Nutricion, /add no debe ser accesible por URL directa.
  // Mismo resolve que la pagina principal; ante dominio apagado redirigimos a /nutrition (que
  // renderiza NutritionDomainOff). Fail-open del resolver mantiene el dominio prendido si el flag esta OFF.
  const clientScope = await getClientScope(user.id)
  const domainEnabled = await resolveNutritionDomainEnabled({
    coachId: String(clientScope.coachId ?? ''),
    clientId: user.id,
    clientTeamId: clientScope.teamId,
    clientOrgId: clientScope.orgId,
  })
  if (!domainEnabled) redirect(`${base}/nutrition`)

  const [recents, favorites] = await Promise.all([
    getRecentIntakeFoods(12),
    getFavoriteIntakeFoods(),
  ])
  const { iso: today } = getTodayInSantiago()

  return (
    <AddFoodClient
      clientId={user.id}
      coachSlug={coach_slug}
      backHref={`${base}/nutrition`}
      today={today}
      recents={recents}
      initialFavorites={favorites}
    />
  )
}
