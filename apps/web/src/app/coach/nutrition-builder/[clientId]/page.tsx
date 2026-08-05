import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  nutritionV2ClientPath,
  shouldSwapCockpitToNutritionV2,
} from '../../nutrition-plans/_lib/nutrition-v2-swap'

/**
 * Ruta legacy. Enterprise sigue cayendo en el editor V1 (`/coach/nutrition-plans/client/[clientId]`);
 * standalone y Team saltan DIRECTO al editor V2 para no encadenar dos redirects server-side.
 */
export default async function NutritionBuilderPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params

  const supabase = await createClient()
  // getClaims(): verificación local del JWT (ES256), sin /user. El proxy ya validó la sesión.
  const { data: __cl } = await supabase.auth.getClaims()
  const user = __cl?.claims?.sub ? { id: __cl.claims.sub as string } : null
  if (!user) redirect('/login')

  if (await shouldSwapCockpitToNutritionV2(user.id)) {
    redirect(nutritionV2ClientPath(clientId))
  }

  redirect(`/coach/nutrition-plans/client/${clientId}`)
}
