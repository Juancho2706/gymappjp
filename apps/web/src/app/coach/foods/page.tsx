import { redirect } from 'next/navigation'

/**
 * T2.3 F5 — `/coach/foods` dejó de ser una pantalla propia.
 *
 * Todo lo que hacía (navegar el catálogo, crear un alimento, clasificarlo en un grupo y
 * definir sus porciones) vive ahora en el tab "Alimentos" del hub de nutrición, con un solo
 * navegador en vez de dos. La ruta queda como puerta de compatibilidad: enlaces viejos,
 * favoritos y correos siguen aterrizando donde corresponde.
 *
 * Es `redirect` (307 temporal) y NO `permanentRedirect`: el rollback de esta fase es un revert
 * del commit entero, y un 308 quedaría cacheado en el navegador del coach sobreviviendo al
 * revert. El destino no depende de la sesión — el gate de acceso del coach ya vive en el
 * layout de `/coach` — así que acá no se consulta ni sesión ni base de datos. La única entrada
 * interna que quedaba (`nutrition-onboarding-shared.ts`) apunta directo al tab, sin pasar por
 * este salto.
 *
 * `FoodSearch.tsx` sigue en esta carpeta: lo importan dos componentes de V1
 * (`FoodCatalogCurationQueue` y `StructuredRecipeDialog`) y no tiene relación con la ruta.
 */

// El destino NO se exporta: un `page.tsx` de App Router solo admite el default y los exports
// de configuración conocidos, así que una constante pública acá arriesga el validador de tipos
// del build. El slug del tab lo define `NutritionHubTabs` (`TAB_SLUG.foods`).
export default function CoachFoodsPage(): never {
  redirect('/coach/nutrition-v2?tab=alimentos')
}
