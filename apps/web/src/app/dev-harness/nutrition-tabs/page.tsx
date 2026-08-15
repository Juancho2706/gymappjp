import { notFound } from 'next/navigation'
import { HarnessView } from './harness-client'

/**
 * HARNESS LOCAL (solo dev) — ver harness-client.tsx. Fuera de development esta ruta no existe.
 */
export default async function NutritionTabsHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { view } = await searchParams
  return <HarnessView view={view ?? 'today'} />
}
