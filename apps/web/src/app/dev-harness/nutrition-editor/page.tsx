import { notFound } from 'next/navigation'
import { EditorHarness } from './harness-client'

/**
 * HARNESS LOCAL (solo dev) — editor unico de nutricion (T3.x W1). Ver harness-client.tsx.
 * Fuera de development esta ruta no existe.
 */
export default async function NutritionEditorHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { mode } = await searchParams
  return <EditorHarness mode={mode === 'create' ? 'create' : 'edit'} />
}
