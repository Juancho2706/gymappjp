import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FoodScannerClient } from '@/components/nutrition-v2/FoodScannerClient'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getClientBasePath } from '@/lib/client/base-path'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getClientNutritionUser } from '../../nutrition/_data/nutrition-auth.queries'
import { getClientScope } from '../../nutrition/_data/client-scope.queries'
import { getNutritionTodayV2ForWeb } from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import { NutritionDomainOff } from '../../nutrition/_components/NutritionDomainOff'

export const metadata = { title: 'Escanear alimento' }

interface Props {
  params: Promise<{ coach_slug: string }>
}

export default async function NutritionV2ScannerPage({ params }: Props) {
  const { coach_slug } = await params
  const base = await getClientBasePath(coach_slug)
  const { user, hasClientRow } = await getClientNutritionUser()
  if (!user || !hasClientRow) redirect(`${base}/login`)

  const scope = await getClientScope(user.id)
  const [enabled, domainEnabled] = await Promise.all([
    isNutritionV2Enabled({
      surface: 'webStudent',
      userId: user.id,
      clientId: user.id,
      coachId: scope.coachId,
      teamId: scope.teamId,
      orgId: scope.orgId,
    }),
    resolveNutritionDomainEnabled({
      coachId: scope.coachId ?? '',
      clientId: user.id,
      clientTeamId: scope.teamId,
      clientOrgId: scope.orgId,
    }),
  ])
  if (!enabled) redirect(`${base}/nutrition`)
  if (!domainEnabled) return <NutritionDomainOff coachSlug={coach_slug} />

  // Contexto de registro (P0 QA: el scan no dejaba registrar): mismo read model del Today
  // que usa TodayExperience, reducido a lo minimo que el dialogo de cantidad/franja necesita.
  const { iso: date } = getTodayInSantiago()
  const today = await getNutritionTodayV2ForWeb({ clientId: user.id, date })
  const registration = {
    localDate: today.localDate,
    timezone: today.timezone,
    planVersionId: today.plan?.versionId ?? null,
    snapshotId: today.snapshotId,
    slotOptions: today.mealSlots.map((slot) => ({ code: slot.code, label: slot.name })),
    revalidatePath: `${base}/nutrition-v2`,
  }

  return (
    <NutritionPageShell
      eyebrow="Catálogo local Chile"
      title="Escanear producto"
      description="Consulta códigos EAN y UPC almacenados en EVA. La cámara nunca llama a un proveedor externo."
      actions={
        <Link
          href={`${base}/nutrition-v2`}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
          Nutrición
        </Link>
      }
    >
      <FoodScannerClient clientId={user.id} registration={registration} />
    </NutritionPageShell>
  )
}
