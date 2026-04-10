import { redirect } from 'next/navigation'

/** Ruta legacy: el editor vive en `/coach/nutrition-plans/client/[clientId]`. */
export default async function NutritionBuilderPage({
  params,
}: {
  params: Promise<{ clientId: string }>
}) {
  const { clientId } = await params
  redirect(`/coach/nutrition-plans/client/${clientId}`)
}
