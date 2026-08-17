import { notFound } from 'next/navigation'
import { BRAND_PRIMARY_COLOR } from '@/lib/brand-assets'
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
 *
 * `?seal=1` (Sello EVA v2, gate S2.2 de `docs/specs/eva-seal-background/`): monta AppSeal
 * variante `b` sobre la maqueta activa (editor/stories/tour) publicando el par `--seal-*`
 * como lo hacen los layouts. `?sealBrand=RRGGBB` (con o sin `#`) cambia la marca de prueba;
 * hex inválido o ausente cae a la marca EVA.
 */
export default async function NutritionEditorHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; stories?: string; tour?: string; seal?: string; sealBrand?: string }>
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { mode, stories, tour, seal, sealBrand } = await searchParams
  const sealHex =
    sealBrand && /^#?[0-9a-fA-F]{6}$/.test(sealBrand)
      ? `#${sealBrand.replace('#', '')}`
      : BRAND_PRIMARY_COLOR
  return (
    <EditorHarness
      mode={mode === 'create' ? 'create' : mode === 'template' ? 'template' : 'edit'}
      stories={stories === '1'}
      tour={tour === 'editor' ? 'editor' : tour === 'hub' ? 'hub' : null}
      seal={seal === '1'}
      sealBrand={sealHex}
    />
  )
}
