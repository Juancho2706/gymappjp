/**
 * Valores del FORMULARIO de marca que no son datos, sino intención (FCN W3.4).
 *
 * `updateBrandSettingsAction` persiste el formulario COMPLETO: lo que no viaja se reescribe con su
 * valor por defecto. Para los checkbox eso significa que **la ausencia es un `false` explícito**
 * (`formData.get(name) === 'on'`), que es exactamente lo que quiere decir el checkbox real de
 * `BrandSettingsForm` cuando el coach lo desmarca.
 *
 * El problema (W3.4): `BrandQuickCard` —la tarjeta de la guía— NO tiene ese checkbox. Reenviaba el
 * estado actual del coach, así que el que estaba en `false` volvía a escribir `false` cada vez que
 * guardaba su marca desde la guía, y el `true` que W3.3 pone al nacer (y el backfill de W3.5)
 * duraba hasta el primer guardado.
 *
 * `BRAND_CHECKBOX_KEEP` es el tercer valor que faltaba: **«este formulario no opina»**. La acción no
 * escribe esa columna cuando lo recibe. No es un `true` disfrazado — un formulario sin opinión no
 * puede ni prender ni apagar.
 *
 * Vive en un módulo aparte porque `settings.actions.ts` es `'use server'` y desde ahí solo se
 * pueden exportar funciones async: la constante no puede salir de ese archivo.
 */
export const BRAND_CHECKBOX_KEEP = 'keep'
