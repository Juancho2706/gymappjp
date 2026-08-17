import { notFound } from 'next/navigation'
import { EditorHarness } from './harness-client'

/**
 * HARNESS LOCAL (solo dev) — editor unico de nutricion (T3.x W1 + T3.v Cabina V0.4).
 * Ver harness-client.tsx. Fuera de development esta ruta no existe.
 *
 * `?stories=1` monta la vista aislada de MacroSpark/MacroSparkPopover (V0.4) en vez del
 * editor completo — la usa el script Playwright `scripts/cabina-visual-check.mjs` para
 * golpear el contrato D3 (hover/tap/Esc/uno-a-la-vez) sin la maraña de sheets del editor.
 *
 * `?tour=editor|hub` monta las stories de la Guía Viva (motor real sobre targets `data-tour` de
 * mentira, ver tour-stories.tsx). Manda por sobre `?stories=1` si vinieran los dos.
 */
export default async function NutritionEditorHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; stories?: string; tour?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { mode, stories, tour } = await searchParams
  return (
    <EditorHarness
      mode={mode === 'create' ? 'create' : mode === 'template' ? 'template' : 'edit'}
      stories={stories === '1'}
      tour={tour === 'editor' ? 'editor' : tour === 'hub' ? 'hub' : null}
    />
  )
}
